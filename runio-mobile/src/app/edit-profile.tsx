import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { ApiError, fetchCurrentUser, updateProfile, uploadAvatar, type CurrentUser } from '@/lib/api';

const COUNTRY_CODE_RE = /^[A-Za-z]{2}$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function EditProfileScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [username, setUsername] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser().then((u) => {
      setUser(u);
      setName(u.name);
      setCity(u.city ?? '');
      setCountryCode(u.countryCode ?? '');
      setUsername(u.username ?? '');
    });
  }, []);

  async function handleChangePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const { avatarUrl } = await uploadAvatar(result.assets[0].uri);
      setUser((prev) => (prev ? { ...prev, avatarUrl } : prev));
    } catch {
      // Non-fatal — previous avatar stays put.
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSave() {
    setError(null);
    if (!name.trim() || !city.trim()) return;
    if (!COUNTRY_CODE_RE.test(countryCode.trim())) {
      setError('המדינה חייבת להיות קוד בן 2 אותיות (למשל US, IL).');
      return;
    }
    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername && !USERNAME_RE.test(trimmedUsername)) {
      setError('שם המשתמש חייב להכיל 3–20 תווים: אותיות, מספרים וקו תחתון.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile(
        name.trim(),
        city.trim(),
        countryCode.trim().toUpperCase(),
        trimmedUsername || undefined
      );
      router.back();
    } catch (err) {
      setError(
        err instanceof ApiError && err.message === 'usernameTaken'
          ? 'שם המשתמש הזה כבר תפוס.'
          : 'לא ניתן היה לשמור את השינויים. נסה שוב.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader showBack title="עריכת פרופיל" />

      <View style={styles.content}>
        <Pressable
          onPress={handleChangePhoto}
          disabled={uploadingAvatar}
          style={styles.avatarWrap}
          accessibilityRole="button"
          accessibilityLabel="החלף תמונת פרופיל"
        >
          <Avatar uri={user.avatarUrl} size={96} />
          {uploadingAvatar ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color={colors.text} size="small" />
            </View>
          ) : (
            <View
              style={[
                styles.editBadge,
                { borderColor: colors.surfaceElevated, backgroundColor: colors.primary },
              ]}
            >
              <MaterialIcons name="photo-camera" size={14} color={colors.background} />
            </View>
          )}
        </Pressable>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>הקש כדי להחליף תמונה</Text>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>שם</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="השם שלך"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>שם משתמש</Text>
          <View
            style={[
              styles.usernameInputWrap,
              { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
            ]}
          >
            <Text style={[styles.usernamePrefix, { color: colors.textSecondary }]}>@</Text>
            <TextInput
              style={[styles.input, styles.usernameInput, { color: colors.text }]}
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase())}
              placeholder="בחר_שם_משתמש"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            מאפשר לחברים למצוא אותך לפי שם משתמש במקום אימייל.
          </Text>
        </View>

        <View style={styles.rowFields}>
          <View style={[styles.field, styles.noTopMargin, { flex: 2 }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>עיר</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
              ]}
              value={city}
              onChangeText={setCity}
              placeholder="תל אביב"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={[styles.field, styles.noTopMargin, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>מדינה</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
              ]}
              value={countryCode}
              onChangeText={(v) => setCountryCode(v.toUpperCase())}
              placeholder="IL"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              maxLength={2}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>אימייל</Text>
          <Text style={[styles.readOnlyValue, { color: colors.textSecondary, borderColor: colors.border }]}>
            {user.email}
          </Text>
        </View>

        {error && (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        )}

        <Button
          label="שמור שינויים"
          onPress={handleSave}
          loading={saving}
          disabled={!name.trim() || !city.trim() || !countryCode.trim()}
          style={styles.saveButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.four, paddingTop: Spacing.five },
  avatarWrap: { position: 'relative' },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(10,12,16,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontFamily: Fonts.regular, fontSize: 12, marginTop: Spacing.two },
  field: { width: '100%', gap: 6, marginTop: Spacing.five },
  noTopMargin: { marginTop: 0 },
  rowFields: { flexDirection: 'row', width: '100%', gap: Spacing.two, marginTop: Spacing.five },
  error: { fontFamily: Fonts.medium, fontSize: 13, marginTop: Spacing.three, textAlign: 'center' },
  fieldLabel: { fontFamily: Fonts.semiBold, fontSize: 13, marginLeft: 2 },
  input: {
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.regular,
    fontSize: 16,
  },
  readOnlyValue: {
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.regular,
    fontSize: 15,
    textAlignVertical: 'center',
    lineHeight: 50,
  },
  saveButton: { width: '100%', marginTop: Spacing.six },
  usernameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  usernamePrefix: { fontFamily: Fonts.medium, fontSize: 16, marginRight: 2 },
  usernameInput: {
    flex: 1,
    height: '100%',
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
});
