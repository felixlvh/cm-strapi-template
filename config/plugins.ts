export default ({ env }) => ({
  ...(env.bool('CM_HIDE_CTB', false) && {
    'content-type-builder': { enabled: false },
  }),
  ...(env.bool('CM_HIDE_I18N', false) && {
    i18n: { enabled: false },
  }),
});
