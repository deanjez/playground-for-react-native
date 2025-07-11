import { makeRedirectUri } from 'expo-auth-session';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Button, Image, StyleSheet } from 'react-native';
import { Account, Client, Databases, ID, Models, OAuthProvider, Permission, RealtimeResponseEvent, Role, Storage } from 'react-native-appwrite';

import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

let client: Client;
let account: Account;
let storage: Storage;
let databases: Databases;
let unsubscribeFromEvents: (() => void) | null = null;

export default function HomeScreen() {
  const [user, setUser] = useState<Models.User<Models.Preferences>>();
  const [event, setEvent] = useState<RealtimeResponseEvent<unknown>>();
  const [document, setDocument] = useState<Models.Document>();
  const [file, setFile] = useState<Models.File>();
  const [subscribed, setSubscribed] = useState(false);

  let setupAppwrite = async () => {
    client = new Client()
      .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT!)
      .setPlatform(process.env.EXPO_PUBLIC_APPWRITE_PLATFORM!);
    account = new Account(client);
    storage = new Storage(client);
    databases = new Databases(client);
    // For session persistance we can get the current account data here
    await getAccount();
  }

  let createSession = async () => {
    try {
      await account.createEmailPasswordSession(
        process.env.EXPO_PUBLIC_APPWRITE_USER_EMAIL!,
        process.env.EXPO_PUBLIC_APPWRITE_USER_PASS!
      );
      getAccount();
    } catch (e) {
      console.log(e);

    }
  }

  let createAnonymousSession = async () => {
    await account.createAnonymousSession();
    getAccount();
  }

  let createOAuth2Session = async (provider: OAuthProvider) => {
    try {
      // REQUIRED
      // Make sure your scheme is set to appwrite-callback-<PROJECT_ID> in your app.json

      // Create deep link that works across Expo environments
      // Ensure localhost is used for the hostname to validation error for success/failure URLs
      const deepLink = new URL(makeRedirectUri({ preferLocalhost: true }));
      const scheme = `${deepLink.protocol}//`; // e.g. 'exp://' or 'appwrite-callback-<PROJECT_ID>://'

      console.log('Using deep link:', deepLink.href);

      // Start OAuth flow
      const loginUrl = await account.createOAuth2Token(
        provider,
        `${deepLink}`,
        `${deepLink}`,
      );

      console.log('OAuth login URL:', loginUrl);

      // Open loginUrl and listen for the scheme redirect
      const result = await WebBrowser.openAuthSessionAsync(`${loginUrl}`, scheme);

      console.log('OAuth result:', result);

      if (result.type !== 'success') {
        // Handle the case where the user cancelled the login or an error occurred
        console.error('OAuth login failed:', result);
        return;
      }

      // Extract credentials from OAuth redirect URL
      const url = new URL(result?.url || '');
      const secret = url.searchParams.get('secret');
      const userId = url.searchParams.get('userId');

      // Create session with OAuth credentials
      await account.createSession(userId!, secret!);
      await getAccount(); // get user, set state, and redirect as needed
    } catch (e) {
      console.log(e);
    }
  }

  let createDoc = async () => {
    try {
      const document = await databases.createDocument(
        process.env.EXPO_PUBLIC_APPWRITE_DATABASE!,
        process.env.EXPO_PUBLIC_APPWRITE_COLLECTION!,
        ID.unique(),
        {
          username: 'test'
        },
        [
          Permission.read(Role.any()),
          Permission.write(Role.any())
        ]
      );
      setDocument(document);
    } catch (e) {
      console.log(e);
    }

  }

  let logout = async () => {
    await account.deleteSession('current');
    setUser(undefined);
  }

  let getAccount = async () => {
    let user = await account.get();
    setUser(user);
  }

  let subscribe = async () => {
    try {
      console.log('Subscribing to documents and files');

      unsubscribeFromEvents = client.subscribe(['documents', 'files'], (event) => {
        console.log('Received event:', event);
        setEvent(event);
      });
      setSubscribed(true);
      console.log('Subscribed to documents and files');
    } catch (e) {
      console.log('Error subscribing:', e);
    }
  }

  let unsubscribe = () => {
    if (unsubscribeFromEvents) {
      unsubscribeFromEvents();
    }
    setSubscribed(false);
  }

  let pickFile = async () => {
    let fl = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false
    });
    let storage = new Storage(client);
    if (!fl.assets) return;
    try {
      const pickedFile = fl.assets[0];
      const file = { name: pickedFile.name, type: pickedFile.mimeType || 'application/octet-stream', uri: pickedFile.uri, size: pickedFile.size || 0 };
      console.log(pickedFile);
      let uploaded = await storage.createFile(
        process.env.EXPO_PUBLIC_APPWRITE_BUCKET!,
        ID.unique(),
        file,
        [
          Permission.read(Role.users()),
        ], (progress) => {
          console.log(progress.chunksUploaded);
        }
      );
      console.log('File uploaded:', uploaded);
      setFile(uploaded);
    } catch (e) {
      console.log(e);
    }
  }

  // Set up appwrite only once upon mounting the application
  useEffect(() => {
    if (!client) {
      setupAppwrite();
    }
  }, []);

  return (
    <ParallaxScrollView>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Appwrite playground</ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Button onPress={createAnonymousSession} title="Anonymous login" disabled={!!user} />
        <Button onPress={createSession} title="Login with email" disabled={!!user} />
        <Button onPress={() => createOAuth2Session(OAuthProvider.Google)} title="Login with Google" disabled={!!user} />
        {user && <ThemedText>{user.name.length ? user.name : 'Anonymous user'}</ThemedText>}
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Button onPress={logout} title="Logout" disabled={!user} />
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Button onPress={subscribe} title="Subscribe" disabled={!!subscribed} />
        <Button onPress={unsubscribe} title="Unsubscribe" disabled={!subscribed} />
        {event && <ThemedText>{JSON.stringify(event.payload, null, 2)}</ThemedText>}
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Button onPress={createDoc} title="Create Document" />
        {document && <ThemedText>{JSON.stringify(document, null, 2)}</ThemedText>}
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Button onPress={pickFile} title="Upload" />
        {file && file.$id && <Image style={{ height: 500, objectFit: 'contain' }} source={{ uri: storage.getFileViewURL(file.bucketId!, file.$id).href }} />}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
});
