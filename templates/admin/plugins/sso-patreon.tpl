<div class="row">
	<div class="col-12">
		<div class="card">
			<div class="card-header">Patreon Social Authentication</div>
			<div class="card-body">
				<p>
					Create a <strong>Patreon OAuth2 Application</strong> and
					then paste your application details here.
				</p>
				<form role="form" class="sso-patreon-settings">
					<div class="form-group">
						<label class="form-label" for="id">Client ID</label>
						<input type="text" id="id" name="id" title="Client ID" class="form-control" placeholder="Client ID"><br />
					</div>
					<div class="form-group">
						<label class="form-label" for="secret">Client Secret</label>
						<input type="text" id="secret" name="secret" title="Secret" class="form-control" placeholder="Secret">
					</div>
					<div class="form-check">
						<input type="checkbox" class="form-check-input" id="showSiteTitle" name="autoconfirm" />
						<label for="showSiteTitle" class="form-check-label">
							Skip email verification for people who register using SSO?
						</label>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>