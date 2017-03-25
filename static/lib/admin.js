define('admin/plugins/sso-patreon', ['settings'], function(Settings) {
	'use strict';
	/* globals $, app, socket, require */

	var ACP = {};

	ACP.init = function() {
		Settings.load('sso-patreon', $('.sso-patreon-settings'));

		$('#save').on('click', function() {
			Settings.save('sso-patreon', $('.sso-patreon-settings'), function() {
				app.alert({
					type: 'success',
					alert_id: 'sso-patreon-saved',
					title: 'Settings Saved',
					message: 'Please reload your NodeBB to apply these settings',
					clickfn: function() {
						socket.emit('admin.reload');
					}
				});
			});
		});
	};

	return ACP;
});