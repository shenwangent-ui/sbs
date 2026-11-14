const config = {
  appId: 'th.shenwang.sbssearch',
  appName: 'SBS Search',
  webDir: 'dist',
  server: {
    url: 'https://ais-pre-brb74sikfl77hnu7quzboq-74288553499.asia-southeast1.run.app',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#1d4ed8',
  },
  ios: {
    scheme: 'SBSSearch',
    contentInset: 'automatic',
    backgroundColor: '#1d4ed8',
  },
};

export default config;
