import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// OAuth redirect target: closes the auth popup on web, then goes home.
WebBrowser.maybeCompleteAuthSession();

export default function SpotifyAuthRedirect() {
  return <Redirect href="/spotify" />;
}
