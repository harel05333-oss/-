import { useEffect, useState } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/components/ui/Button';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { useT } from '@/contexts/LocaleContext';
import { ApiError, signIn, signInWithGoogle, signUp } from '@/lib/api';

const ISRAELI_MOBILE_RE = /^05\d{8}$/;
const COUNTRY_CODE_RE = /^[A-Za-z]{2}$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const strings = {
  he: {
    tagline: 'מהירות עלית',
    nameLabel: 'שם',
    namePlaceholder: 'השם שלך',
    usernameLabel: 'שם משתמש',
    usernamePlaceholder: 'בחר_שם_משתמש',
    emailLabel: 'אימייל',
    passwordLabel: 'סיסמה',
    hidePassword: 'הסתר סיסמה',
    showPassword: 'הצג סיסמה',
    phoneLabel: 'טלפון',
    cityLabel: 'עיר',
    cityPlaceholder: 'תל אביב',
    countryLabel: 'מדינה',
    signUpButton: 'צור חשבון',
    signInButton: 'התחבר',
    hasAccount: 'כבר יש לך חשבון?',
    noAccount: 'אין לך חשבון?',
    signInLink: 'התחברות',
    signUpLink: 'הרשמה',
    dividerText: 'או המשך עם',
    googleConnecting: 'מתחבר…',
    googleContinue: 'המשך עם Google',
    footer: 'RACEON',
    errorGoogleFailed: 'ההתחברות עם Google נכשלה. נסה שוב.',
    errorNameRequired: 'הזן את שמך.',
    errorUsernameInvalid: 'שם המשתמש חייב להכיל 3–20 תווים: אותיות, מספרים וקו תחתון.',
    errorPhoneInvalid: 'הזן מספר נייד תקין (למשל 0501234567).',
    errorCityRequired: 'הזן את העיר שלך.',
    errorCountryInvalid: 'הזן את המדינה שלך כקוד בן 2 אותיות (למשל US, IL).',
    errorPasswordTooShort: 'הסיסמה חייבת להכיל לפחות 8 תווים.',
    errorInvalidCredentials: 'אימייל או סיסמה שגויים.',
    errorUsernameTaken: 'שם המשתמש הזה כבר תפוס.',
    errorEmailTaken: 'כבר קיים חשבון עם האימייל הזה.',
    errorCheckDetails: 'בדוק את הפרטים שהזנת ונסה שוב.',
    errorGeneric: 'משהו השתבש. נסה שוב.',
  },
  en: {
    tagline: 'Elite Speed',
    nameLabel: 'Name',
    namePlaceholder: 'Your name',
    usernameLabel: 'Username',
    usernamePlaceholder: 'choose_a_username',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    hidePassword: 'Hide password',
    showPassword: 'Show password',
    phoneLabel: 'Phone',
    cityLabel: 'City',
    cityPlaceholder: 'Tel Aviv',
    countryLabel: 'Country',
    signUpButton: 'Create Account',
    signInButton: 'Sign In',
    hasAccount: 'Already have an account?',
    noAccount: "Don't have an account?",
    signInLink: 'Sign In',
    signUpLink: 'Sign Up',
    dividerText: 'Or continue with',
    googleConnecting: 'Connecting…',
    googleContinue: 'Continue with Google',
    footer: 'RACEON',
    errorGoogleFailed: 'Google sign-in failed. Please try again.',
    errorNameRequired: 'Enter your name.',
    errorUsernameInvalid: 'Username must be 3–20 characters: letters, numbers, and underscores.',
    errorPhoneInvalid: 'Enter a valid mobile number (e.g. 0501234567).',
    errorCityRequired: 'Enter your city.',
    errorCountryInvalid: 'Enter your country as a 2-letter code (e.g. US, IL).',
    errorPasswordTooShort: 'Password must be at least 8 characters.',
    errorInvalidCredentials: 'Incorrect email or password.',
    errorUsernameTaken: 'That username is already taken.',
    errorEmailTaken: 'An account with this email already exists.',
    errorCheckDetails: 'Check the details you entered and try again.',
    errorGeneric: 'Something went wrong. Please try again.',
  },
};

WebBrowser.maybeCompleteAuthSession();

const HERO_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA7Vc7Y1NXBdIf_v5dzAXuX95CNZKbivQqaz9IH_bCUkPYYWw1oQoxrB2jMWB7XOtjB2J0ljgJJXBwTv2rfkP_FAn_BStfA2okIWMjSREtZCs-2vlLJP5bOrWzheDtWQXsCvd3xmxoe3gmsC5UOu362k7kSAQ1eNifeHr03vZ7J_DLTcRvccGqSM4OAhqZwXMerZI5gG8Vy5ZGrz-wqHMCANsTmLmCk8KSsQzQrLF0DezYPCJ3doXi2ivVZpYEXlb1sVrqSWlmcj6Ja';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const redirectUri = makeRedirectUri({ scheme: 'runio', path: 'redirect' });
// Printed once so the exact string can be pasted into Google Cloud Console →
// Credentials → this Web client → Authorized redirect URIs. In Expo Go this
// embeds the current LAN IP, so it changes whenever that does (see
// runio-mobile README) — re-register it in Console when that happens.
console.log('[google-auth] redirect URI:', redirectUri);

export default function SignInScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const t = useT(strings);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  function toggleMode() {
    setIsSignUp((v) => !v);
    setError(null);
  }

  // expo-auth-session's Google provider requires a platform-specific client ID
  // to even construct the request (iosClientId on iOS, androidClientId on
  // Android) even though we only ever use the browser-based web flow — so the
  // same Web client ID is supplied for all three. responseType is 'code':
  // Google's own policy blocks the implicit (id_token) flow entirely for
  // custom-scheme redirects, so we use Authorization Code + PKCE instead
  // (usePKCE defaults to true for the code flow) and send the resulting code
  // + code verifier to our backend, which is the only place that holds the
  // client secret needed to exchange them with Google.
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_CLIENT_ID,
    androidClientId: GOOGLE_CLIENT_ID,
    responseType: 'code',
    redirectUri,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const code = response.params.code;
    const codeVerifier = request?.codeVerifier;
    if (!codeVerifier) {
      setError(t.errorGoogleFailed);
      return;
    }
    setError(null);
    setIsGoogleSubmitting(true);
    signInWithGoogle(code, codeVerifier, redirectUri)
      .then(() => router.replace('/lobby'))
      .catch((err) => {
        setError(err instanceof Error ? err.message : t.errorGoogleFailed);
      })
      .finally(() => setIsGoogleSubmitting(false));
  }, [response, request, router, t]);

  async function handleSignIn() {
    setError(null);

    if (isSignUp) {
      if (!name.trim()) {
        setError(t.errorNameRequired);
        return;
      }
      if (!USERNAME_RE.test(username.trim().toLowerCase())) {
        setError(t.errorUsernameInvalid);
        return;
      }
      if (!ISRAELI_MOBILE_RE.test(phone.trim())) {
        setError(t.errorPhoneInvalid);
        return;
      }
      if (!city.trim()) {
        setError(t.errorCityRequired);
        return;
      }
      if (!COUNTRY_CODE_RE.test(countryCode.trim())) {
        setError(t.errorCountryInvalid);
        return;
      }
      if (password.length < 8) {
        setError(t.errorPasswordTooShort);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(
          name.trim(),
          email.trim().toLowerCase(),
          phone.trim(),
          password,
          city.trim(),
          countryCode.trim().toUpperCase(),
          username.trim().toLowerCase()
        );
      } else {
        await signIn(email.trim().toLowerCase(), password);
      }
      router.replace('/lobby');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t.errorInvalidCredentials);
      } else if (err instanceof ApiError && err.status === 409 && err.message === 'usernameTaken') {
        setError(t.errorUsernameTaken);
      } else if (err instanceof ApiError && err.status === 409) {
        setError(t.errorEmailTaken);
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t.errorCheckDetails);
      } else {
        // Network/server issue — surface the real message so this doesn't
        // look like a wrong password when it isn't one.
        setError(err instanceof Error ? err.message : t.errorGeneric);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ImageBackground source={{ uri: HERO_IMAGE }} style={styles.background} resizeMode="cover">
      <LinearGradient
        colors={['rgba(10,12,16,0.25)', 'rgba(10,12,16,0.65)', 'rgba(10,12,16,0.97)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safeArea}>
          <BlurView intensity={40} tint="dark" style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glassBg }]}>
            <View style={styles.cardInner}>
              <View style={styles.header}>
                <BrandLogo size={64} />
                <Text style={[Typography.headlineLg, { color: colors.primary }]}>RACEON</Text>
                <Text style={[styles.tagline, { color: colors.primary }]}>{t.tagline}</Text>
              </View>

              <View style={styles.form}>
                {isSignUp && (
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t.nameLabel}</Text>
                    <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                      <MaterialIcons name="person" size={20} color={colors.textSecondary} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder={t.namePlaceholder}
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="words"
                        value={name}
                        onChangeText={setName}
                      />
                    </View>
                  </View>
                )}

                {isSignUp && (
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t.usernameLabel}</Text>
                    <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                      <MaterialIcons name="alternate-email" size={20} color={colors.textSecondary} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder={t.usernamePlaceholder}
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={20}
                        value={username}
                        onChangeText={(v) => setUsername(v.toLowerCase())}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t.emailLabel}</Text>
                  <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                    <MaterialIcons name="email" size={20} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>סיסמה</Text>
                  <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                    <MaterialIcons name="lock" size={20} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="••••••••"
                      placeholderTextColor={colors.textSecondary}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                      value={password}
                      onChangeText={setPassword}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    >
                      <MaterialIcons
                        name={showPassword ? 'visibility-off' : 'visibility'}
                        size={20}
                        color={colors.textSecondary}
                      />
                    </Pressable>
                  </View>
                </View>

                {isSignUp && (
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>טלפון</Text>
                    <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                      <MaterialIcons name="phone" size={20} color={colors.textSecondary} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="0501234567"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                      />
                    </View>
                  </View>
                )}

                {isSignUp && (
                  <View style={styles.rowFields}>
                    <View style={[styles.field, { flex: 2 }]}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>עיר</Text>
                      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                        <MaterialIcons name="location-city" size={20} color={colors.textSecondary} />
                        <TextInput
                          style={[styles.input, { color: colors.text }]}
                          placeholder="תל אביב"
                          placeholderTextColor={colors.textSecondary}
                          value={city}
                          onChangeText={setCity}
                        />
                      </View>
                    </View>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>מדינה</Text>
                      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                        <TextInput
                          style={[styles.input, { color: colors.text }]}
                          placeholder="IL"
                          placeholderTextColor={colors.textSecondary}
                          autoCapitalize="characters"
                          maxLength={2}
                          value={countryCode}
                          onChangeText={(v) => setCountryCode(v.toUpperCase())}
                        />
                      </View>
                    </View>
                  </View>
                )}

                {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

                <Button
                  label={isSignUp ? 'צור חשבון' : 'התחבר'}
                  icon="arrow-forward"
                  onPress={handleSignIn}
                  loading={isSubmitting}
                  disabled={
                    isSignUp
                      ? !name || !username || !email || !phone || !city || !countryCode || !password
                      : !email || !password
                  }
                  style={styles.button}
                />

                <Pressable onPress={toggleMode} hitSlop={8} style={styles.toggleModeRow}>
                  <Text style={[styles.toggleModeText, { color: colors.textSecondary }]}>
                    {isSignUp ? 'כבר יש לך חשבון?' : 'אין לך חשבון?'}{' '}
                    <Text style={{ color: colors.primary }}>{isSignUp ? 'התחברות' : 'הרשמה'}</Text>
                  </Text>
                </Pressable>
              </View>

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textSecondary }]}>
                  או המשך עם
                </Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              <Pressable
                onPress={() => promptAsync()}
                disabled={!request || isGoogleSubmitting}
                style={[
                  styles.googleButton,
                  { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
                  (!request || isGoogleSubmitting) && styles.googleButtonDisabled,
                ]}
              >
                <FontAwesome name="google" size={16} color={colors.text} />
                <Text style={[styles.googleButtonLabel, { color: colors.text }]}>
                  {isGoogleSubmitting ? 'מתחבר…' : 'המשך עם Google'}
                </Text>
              </Pressable>
            </View>
          </BlurView>

          <Text style={[styles.footer, { color: colors.textSecondary }]}>RACEON</Text>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardInner: { padding: Spacing.five },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  tagline: {
    fontFamily: Fonts.labelBold,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: Spacing.one,
  },
  form: {
    gap: Spacing.three,
  },
  rowFields: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  googleButton: {
    marginTop: Spacing.four,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  googleButtonDisabled: { opacity: 0.5 },
  googleButtonLabel: {
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  field: { gap: 6 },
  fieldLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 16,
  },
  button: {
    marginTop: Spacing.one,
  },
  toggleModeRow: {
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  toggleModeText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  error: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
});
