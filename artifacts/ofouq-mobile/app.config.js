function clean(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

module.exports = ({ config }) => {
  const projectId =
    clean(process.env.EXPO_PUBLIC_EAS_PROJECT_ID) ??
    clean(process.env.EAS_PROJECT_ID) ??
    clean(config.extra?.eas?.projectId);

  return {
    ...config,
    extra: {
      ...config.extra,
      ...(projectId
        ? {
            eas: {
              ...(config.extra?.eas ?? {}),
              projectId,
            },
          }
        : {}),
    },
  };
};
