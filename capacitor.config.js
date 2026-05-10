module.exports = {
  appId: 'com.birdidentifier.app',
  appName: 'Bird Identifier',
  webDir: '.',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0B1A2E'
    }
  },
  ios: {
    contentSecurityPolicy: "<meta http-equiv='Content-Security-Policy' content=\"default-src * data: blob: 'self' https://api.inaturalist.org https://*.googleapis.com https://vision.googleapis.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.inaturalist.org https://*.googleusercontent.com;\">"
  },
  android: {
    contentSecurityPolicy: "default-src * data: blob: 'self' https://api.inaturalist.org https://*.googleapis.com https://vision.googleapis.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.inaturalist.org https://*.googleusercontent.com"
  }
};