// Disposable test fixture. All Keychain operations are explicitly scoped to the
// caller's temporary file, and UI is disabled before any operation. The only
// password item this program knows is an embedded, non-sensitive dummy value.
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#ifndef BUILD_VERSION
#define BUILD_VERSION 0
#endif
int main(int argc, char **argv) {
  if(argc<3) return 99;
  if (SecKeychainSetUserInteractionAllowed(false) != errSecSuccess) return 97;
  SecKeychainRef kc=NULL; OSStatus status;
  const char* service="Glow isolated fixture only"; const char* account="dummy-account";
  if(!strcmp(argv[1],"create")) {
    char password[256]; if(!fgets(password,sizeof(password),stdin)) return 98; password[strcspn(password,"\n")]=0;
    status=SecKeychainCreate(argv[2],(UInt32)strlen(password),password,false,NULL,&kc);
    memset(password,0,sizeof(password));
    printf("create_status=%d\n",(int)status); return status==0?0:2;
  }
  status=SecKeychainOpen(argv[2],&kc); if(status) {printf("open_status=%d\n",(int)status);return 2;}
  if(!strcmp(argv[1],"unlock")) {
    char password[256]; if(!fgets(password,sizeof(password),stdin)) return 98; password[strcspn(password,"\n")]=0;
    status=SecKeychainUnlock(kc,(UInt32)strlen(password),password,true); memset(password,0,sizeof(password));
    printf("unlock_status=%d\n",(int)status); return status==0?0:2;
  }
  if(!strcmp(argv[1],"seed")) {
    if(argc!=4)return 98;
    SecTrustedApplicationRef trusted=NULL; status=SecTrustedApplicationCreateFromPath(argv[3],&trusted);
    if(status){printf("trust_status=%d\n",(int)status);return 2;}
    CFArrayRef trustedList=CFArrayCreate(NULL,(const void **)&trusted,1,&kCFTypeArrayCallBacks);
    SecAccessRef access=NULL; status=SecAccessCreate(CFSTR("Glow dummy fixture"),trustedList,&access);
    if(status){printf("access_status=%d\n",(int)status);return 2;}
    SecKeychainAttribute attrs[]={{kSecServiceItemAttr,(UInt32)strlen(service),(void*)service},{kSecAccountItemAttr,(UInt32)strlen(account),(void*)account}};
    SecKeychainAttributeList list={2,attrs}; const char* secret="isolated-dummy-value"; SecKeychainItemRef item=NULL;
    status=SecKeychainItemCreateFromContent(kSecGenericPasswordItemClass,&list,(UInt32)strlen(secret),secret,kc,access,&item);
    printf("seed_status=%d\n",(int)status); return status==0?0:2;
  }
  UInt32 length=0;void* data=NULL;
  status=SecKeychainFindGenericPassword(kc,(UInt32)strlen(service),service,(UInt32)strlen(account),account,&length,&data,NULL);
  int matched=status==0&&length==strlen("isolated-dummy-value")&&!memcmp(data,"isolated-dummy-value",length);
  if(data)SecKeychainItemFreeContent(NULL,data);
  printf("version=%d read_status=%d dummy_matched=%d\n",BUILD_VERSION,(int)status,matched);
  return matched?0:3;
}
