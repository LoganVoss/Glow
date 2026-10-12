// Narrow bridge to Security.framework: secrets arrive over stdin, never argv.
// This helper only operates on the explicitly supplied private Glow keychain.
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void clear_secret(unsigned char *buffer, size_t size) {
  volatile unsigned char *cursor = buffer;
  while (size--) *cursor++ = 0;
}

int main(int argc, char **argv) {
  if (argc != 3 || (strcmp(argv[1], "create") && strcmp(argv[1], "unlock") && strcmp(argv[1], "lock") && strcmp(argv[1], "status"))) return 64;
  unsigned char password[256] = {0};
  size_t length = 0;
  if (!strcmp(argv[1], "create") || !strcmp(argv[1], "unlock")) {
    length = fread(password, 1, sizeof(password), stdin);
    if (length != 64 || !feof(stdin)) { clear_secret(password, sizeof(password)); return 65; }
  }
  SecKeychainRef keychain = NULL;
  OSStatus status = SecKeychainSetUserInteractionAllowed(false);
  if (status == errSecSuccess) {
    if (!strcmp(argv[1], "create")) status = SecKeychainCreate(argv[2], (UInt32)length, password, false, NULL, &keychain);
    else status = SecKeychainOpen(argv[2], &keychain);
  }
  if (status == errSecSuccess && !strcmp(argv[1], "unlock")) status = SecKeychainUnlock(keychain, (UInt32)length, password, true);
  if (status == errSecSuccess && !strcmp(argv[1], "lock")) status = SecKeychainLock(keychain);
  if (status == errSecSuccess && !strcmp(argv[1], "status")) {
    SecKeychainStatus flags = 0;
    status = SecKeychainGetStatus(keychain, &flags);
    if (status == errSecSuccess) printf("%s\n", (flags & kSecUnlockStateStatus) ? "unlocked" : "locked");
  }
  if (status == errSecSuccess && !strcmp(argv[1], "create")) {
    SecKeychainSettings settings = { SEC_KEYCHAIN_SETTINGS_VERS1, true, true, 3600 };
    status = SecKeychainSetSettings(keychain, &settings);
  }
  clear_secret(password, sizeof(password));
  if (keychain) CFRelease(keychain);
  if (status != errSecSuccess) { fprintf(stderr, "Glow private keychain operation failed (%d).\n", (int)status); return 1; }
  return 0;
}
