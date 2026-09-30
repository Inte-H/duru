const defaults = {
  SYSTEM: {
    LAB_ENABLED: false,
    MAIN_MENU: {
      ADMIN: { LIST: ['ADMIN_REPORT', 'ADMIN_ARCHIVE'] },
    },
  },
};

export default function settings(state = defaults) {
  return state;
}
