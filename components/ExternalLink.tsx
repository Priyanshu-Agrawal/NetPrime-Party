import { openBrowserAsync } from 'expo-web-browser';
import { type ComponentProps } from 'react';
import { Platform, Pressable } from 'react-native';

type Props = Omit<ComponentProps<typeof Pressable>, 'onPress'> & { href: string };

export function ExternalLink({ href, children, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      onPress={async () => {
        if (Platform.OS !== 'web') {
          await openBrowserAsync(href);
        }
      }}
    >
      {children}
    </Pressable>
  );
}
