import Enum from './Enum';

class Option {
  constructor() {
    this._contextPath = '/';
  }

  get CONTEXT_PATH() {
    return this._contextPath;
  }

  get API_PATH() {
    return '/api/v1/';
  }

  get ROUTE_PATH() {
    return {
      SIGN_IN: this.CONTEXT_PATH + 'signin',
      HOME: this.CONTEXT_PATH + 'home',
      DOCUMENT: this.CONTEXT_PATH + 'document',
      HELP: this.CONTEXT_PATH + 'help',
      ADMIN_MEMBER: this.CONTEXT_PATH + 'admin/member',
      ADMIN_GROUP: this.CONTEXT_PATH + 'admin/group',
      LAB: this.CONTEXT_PATH + 'lab',
      LAB_RESULT: this.CONTEXT_PATH + 'lab/result',
    };
  }

  get REST_API() {
    return {
      AUTH: {
        SIGN_IN: { METHOD: Enum.HTTP_METHOD.POST, URL: this.API_PATH + 'auth/sign-in' },
      },
      DOCUMENT: {
        LIST: { METHOD: Enum.HTTP_METHOD.GET, URL: this.API_PATH + 'document/list' },
        DETAIL: { METHOD: Enum.HTTP_METHOD.GET, URL: this.API_PATH + 'document/{0}' },
        RENAME: { METHOD: Enum.HTTP_METHOD.PUT, URL: this.API_PATH + 'document/{0}/name' },
        ARCHIVE: { METHOD: Enum.HTTP_METHOD.POST, URL: this.API_PATH + 'archive/document' },
      },
      MEMBER: {
        LIST: { METHOD: Enum.HTTP_METHOD.GET, URL: this.API_PATH + 'member/list' },
      },
      LAB: {
        EXPERIMENT: { METHOD: Enum.HTTP_METHOD.GET, URL: this.API_PATH + 'lab/experiment' },
      },
    };
  }
}

export default new Option();
