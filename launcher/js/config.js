/* Settings for this launcher.
   SIMKL_CLIENT_ID: from simkl.com/settings/developer, an app registered as
   "TV, devices & command line" (AUTH V2). A client id is public; there is no secret. */
window.HOMEOS_CONFIG = {
  SIMKL_CLIENT_ID: "b24e5de9d5b72a60d72ebf15a2b8aacedb741f69d0f145db12b6a4a7d4f0b916",
  APP_NAME: "homeos",
  APP_VERSION: "0.2.0"
};
// Preview only: ?mock in the address uses the sample films and shows instead of SIMKL.
if (/[?&]mock\b/.test(location.search)) window.HOMEOS_CONFIG.SIMKL_CLIENT_ID = "";
