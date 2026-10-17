import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// OAuth redirect target for Google Drive: closes the popup on web, then goes back.
WebBrowser.maybeCompleteAuthSession();

export default function DriveAuthRedirect() {
  return <Redirect href="/drive" />;
}
