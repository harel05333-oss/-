import { Image, View } from 'react-native';

/** Clip the source's white outer margin while preserving the approved artwork. */
export function BrandLogo({ size = 32 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <Image
        source={require('../../../assets/branding/runio-r-circle-green-v1.png')}
        style={{ width: size * 1.21, height: size * 1.21, position: 'absolute', left: -size * 0.105, top: -size * 0.105 }}
        resizeMode="contain"
        accessible={false}
      />
    </View>
  );
}
