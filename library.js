(function(module) {
	'use strict';
	/* globals module, require */

	var user = require.main.require('./src/user'),
		meta = require.main.require('./src/meta'),
		db = require.main.require('./src/database'),
		passport = module.parent.require('passport'),
		passportPatreon = require('passport-patreon').Strategy,
		nconf = module.parent.require('nconf'),
		async = module.parent.require('async'),
		winston = module.parent.require('winston');

	var authenticationController = require.main.require('./src/controllers/authentication');

	var constants = Object.freeze({
		'name': 'Patreon',
		'admin': {
			'route': '/plugins/sso-patreon',
			'icon': 'fa-patreon'
		}
	});

	var Patreon = {
		settings: undefined
	};

	Patreon.init = function(params, callback) {
		function render(req, res) {
			res.render('admin/plugins/sso-patreon', {});
		}

		params.router.get('/admin/plugins/sso-patreon', params.middleware.admin.buildHeader, render);
		params.router.get('/api/admin/plugins/sso-patreon', render);

		callback();
	};

	Patreon.getSettings = function(callback) {
		if (Patreon.settings) {
			return callback();
		}

		meta.settings.get('sso-patreon', function(err, settings) {
			Patreon.settings = settings;
			callback();
		});
	}

	Patreon.getStrategy = function(strategies, callback) {
		if (!Patreon.settings) {
			return Patreon.getSettings(function() {
				Patreon.getStrategy(strategies, callback);
			});
		}

		if (
			Patreon.settings !== undefined
			&& Patreon.settings.hasOwnProperty('id') && Patreon.settings.id
			&& Patreon.settings.hasOwnProperty('secret') && Patreon.settings.secret
		) {
			passport.use(new passportPatreon({
				clientID: Patreon.settings.id,
				clientSecret: Patreon.settings.secret,
				callbackURL: nconf.get('url') + '/auth/patreon/callback',
				passReqToCallback: true
			}, function(req, accessToken, refreshToken, profile, done) {
				if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
					// Save patreon-specific information to the user
					user.setUserField(req.user.uid, 'patreonid', profile.id);
					db.setObjectField('patreonid:uid', profile.id, req.user.uid);
					return done(null, req.user);
				}

				var email;
				if (profile && profile._json.attributes.hasOwnProperty('email')) {
					email = profile._json.attributes.email;
				}

				Patreon.login(profile.id, profile.name, email, profile.avatar, accessToken, refreshToken, profile, function(err, user) {
					if (err) {
						return done(err);
					}

					// Require collection of email
					if (!email) {
						req.session.registration = req.session.registration || {};
						req.session.registration.uid = user.uid;
						req.session.registration.patreonid = profile.id;
					}

					authenticationController.onSuccessfulLogin(req, user.uid, done.bind(null, null, user));
				});
			}));

			strategies.push({
				name: 'patreon',
				url: '/auth/patreon',
				callbackURL: '/auth/patreon/callback',
				icon: constants.admin.icon
			});
		}

		callback(null, strategies);
	};

	Patreon.getAssociation = function(data, callback) {
		user.getUserField(data.uid, 'patreonid', function(err, patreonid) {
			if (err) {
				return callback(err, data);
			}

			if (patreonid) {
				data.associations.push({
					associated: true,
					url: 'https://patreon.com/' + patreonid,
					name: constants.name,
					icon: constants.admin.icon
				});
			} else {
				data.associations.push({
					associated: false,
					url: nconf.get('url') + '/auth/patreon',
					name: constants.name,
					icon: constants.admin.icon
				});
			}

			callback(null, data);
		})
	};

	Patreon.prepareInterstitial = function(data, callback) {
		// Only execute if:
		//   - uid and patreonid are set in session
		//   - user has no email
		if (data.userData.hasOwnProperty('uid') && data.userData.hasOwnProperty('patreonid')) {
			user.getUserField(data.userData.uid, 'email', function(err, email) {
				if (!email) {
					data.interstitials.push({
						template: 'partials/sso-patreon/email.tpl',
						data: {},
						callback: Patreon.storeAdditionalData
					});
				}

				callback(null, data);
			});
		} else {
			callback(null, data);
		}
	};

	Patreon.storeAdditionalData = function(userData, data, callback) {
		async.waterfall([
			// Reset email confirm throttle
			async.apply(db.delete, 'uid:' + userData.uid + ':confirm:email:sent'),
			async.apply(user.getUserField, userData.uid, 'email'),
			function (email, next) {
				// Remove the old email from sorted set reference
				db.sortedSetRemove('email:uid', email, next);
			},
			async.apply(user.setUserField, userData.uid, 'email', data.email),
			async.apply(user.email.sendValidationEmail, userData.uid, data.email)
		], callback);
	};

	// Patreon.storeTokens = function(uid, accessToken, refreshToken) {
	// 	//JG: Actually save the useful stuff
	// 	winston.verbose("Storing received fb access information for uid(" + uid + ") accessToken(" + accessToken + ") refreshToken(" + refreshToken + ")");
	// 	user.setUserField(uid, 'fbaccesstoken', accessToken);
	// 	user.setUserField(uid, 'fbrefreshtoken', refreshToken);
	// };

	Patreon.login = function(patreonid, name, email, picture, accessToken, refreshToken, profile, callback) {
		Patreon.getUidByPatreonid(patreonid, function(err, uid) {
			if(err) {
				return callback(err);
			}

			if (uid !== null) {
				// Existing User

				// Patreon.storeTokens(uid, accessToken, refreshToken);

				callback(null, {
					uid: uid
				});
			} else {
				// New User
				var success = function(uid) {
					// Save patreon-specific information to the user
					user.setUserField(uid, 'patreonid', patreonid);
					db.setObjectField('patreonid:uid', patreonid, uid);
					var autoConfirm = Patreon.settings && Patreon.settings.autoconfirm === "on" ? 1: 0;
					user.setUserField(uid, 'email:confirmed', autoConfirm);

					if (autoConfirm) {
						db.sortedSetRemove('users:notvalidated', uid);
					}
					
					// Save their photo, if present
					if (picture) {
						user.setUserField(uid, 'uploadedpicture', picture);
						user.setUserField(uid, 'picture', picture);
					}

					// Patreon.storeTokens(uid, accessToken, refreshToken);

					callback(null, {
						uid: uid
					});
				};

				user.getUidByEmail(email, function(err, uid) {
					if(err) {
						return callback(err);
					}

					if (!uid) {
						user.create({ username: name, email: email, fullname: profile._json.attributes.full_name }, function(err, uid) {
							if(err) {
								return callback(err);
							}

							success(uid);
						});
					} else {
						success(uid); // Existing account -- merge
					}
				});
			}
		});
	};

	Patreon.getUidByPatreonid = function(patreonid, callback) {
		db.getObjectField('patreonid:uid', patreonid, function(err, uid) {
			if (err) {
				return callback(err);
			}
			callback(null, uid);
		});
	};

	Patreon.addMenuItem = function(custom_header, callback) {
		custom_header.authentication.push({
			'route': constants.admin.route,
			'icon': constants.admin.icon,
			'name': constants.name
		});

		callback(null, custom_header);
	};

	Patreon.deleteUserData = function(data, callback) {
		var uid = data.uid;

		async.waterfall([
			async.apply(user.getUserField, uid, 'patreonid'),
			function(oAuthIdToDelete, next) {
				db.deleteObjectField('patreonid:uid', oAuthIdToDelete, next);
			}
		], function(err) {
			if (err) {
				winston.error('[sso-patreon] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
				return callback(err);
			}
			callback(null, uid);
		});
	};

	module.exports = Patreon;
}(module));
