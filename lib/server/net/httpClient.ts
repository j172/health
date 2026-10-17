import "server-only";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import zlib from "node:zlib";

/**
 * Plain node:http(s) client, deliberately avoiding the global fetch()/undici
 * path — undici lazily instantiates a WASM llhttp parser on first use, which
 * fails with "WebAssembly.instantiate(): Out of memory" on hosts with a low
 * `ulimit -v` (virtual memory) cap, such as this shared-hosting account.
 * Node's core http/https client uses the native (non-WASM) llhttp built into
 * the binary, so it isn't affected.
 */

// hpa.gov.tw, yonglin.org.tw, and familyedu.moe.gov.tw serve TLS chains without
// intermediate certificates, so Node (which doesn't fetch missing intermediates
// via AIA like some curl builds do) fails with "unable to verify the first certificate".
// Trust them explicitly alongside Node's normal root store.
// 1) HPA: TWCA Secure SSL Certification Authority
// Subject: C=TW, O=TAIWAN-CA, CN=TWCA Secure SSL Certification Authority
// Issuer: TWCA Global Root CA — https://sslserver.twca.com.tw/cacert/secure_sha2_2023G3.crt
const TWCA_SECURE_SSL_INTERMEDIATE_CA = `-----BEGIN CERTIFICATE-----
MIIFxjCCA66gAwIBAgIQQAE0s2gAAAAAAAAM0KoI7DANBgkqhkiG9w0BAQsFADBR
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRwwGgYDVQQDExNUV0NBIEdsb2JhbCBSb290IENBMB4XDTIzMTAxNjA5MDEw
NFoXDTMwMTAxNjE1NTk1OVowUzELMAkGA1UEBhMCVFcxEjAQBgNVBAoTCVRBSVdB
Ti1DQTEwMC4GA1UEAxMnVFdDQSBTZWN1cmUgU1NMIENlcnRpZmljYXRpb24gQXV0
aG9yaXR5MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyS5amjYQhd10
hZs00r7RXdI3ASka2AQmJnOyA6bqvAYOMlMECUdlsjDccdmMdHx8YTYYMtmCy+UB
RJZ/ytVANVQlfcUvXzWfauFs8XpCC/Th+Ed2tIEEGK218QsBebImAHPGDvp2Yglj
XVaQR/0FeN1lIzQ3iUkad0dCsC/bxFiWsmsjeSscTaxrYzHFADUhK0qj4W5PmOuw
lAR3C4XXgzPAI3V0qBpQ7sqgNLaNBFTZkP6AVryZC+DapfWBIMmIxIOg8g25MKb4
XvXkCLYKIxi8Djhv1zSmLLrKbQFZrjWlD/OWqInPPmSwBrKZ13EMQhoRRi1pXfN+
J2ugR/PUQQIDAQABo4IBljCCAZIwHwYDVR0jBBgwFoAUSNvN3o7pSXJaiOix2D0H
s7lrZlAwHQYDVR0OBBYEFJLn+mIWcYzzl3FCxgan4EZhS1y2MA4GA1UdDwEB/wQE
AwIBhjAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwSgYDVR0gBEMwQTA1
BgsrBgEEAYK/JQEBFTAmMCQGCCsGAQUFBwIBFhhodHRwczovL3d3dy50d2NhLmNv
bS50dy8wCAYGZ4EMAQICMEkGA1UdHwRCMEAwPqA8oDqGOGh0dHA6Ly9yb290Y2Eu
dHdjYS5jb20udHcvVFdDQVJDQS9nbG9iYWxfcmV2b2tlXzQwOTYuY3JsMBIGA1Ud
EwEB/wQIMAYBAf8CAQAwdgYIKwYBBQUHAQEEajBoMDwGCCsGAQUFBzAChjBodHRw
Oi8vc3Nsc2VydmVyLnR3Y2EuY29tLnR3L2NhY2VydC9yb290NDA5Ni5jcnQwKAYI
KwYBBQUHMAGGHGh0dHA6Ly9yb290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZIhvcN
AQELBQADggIBADVzQW2rRsMiWoVrBdZX1BiOgN6B/Ryt2zpq8uRxFQspvGYfUVIm
4uU4AaPR7aQ5KwpKjDWv2ncvX2ssCY54B82g2mxEEVEdu5PFl0jkuk4LmPsClYZc
6J6odUbVI3wtv2yF6+fqQrO+gDhEIhlg3IqWICfiyJZS+p2TirMszGzs4a+K9tZX
rS2W/jKsSt4bSmcIzDpwm2gSaSuLDIAwq0WrD29kA7+N+rMMs4zBIVKyYm9r08q4
UOGU16J7mKBrF0KYDZFyT9Hq5HAX2uwYoQJxQ5Z0BR8eZH8AIIi2vsFC8pkv2ra1
2dldd3Pivm0mdratbn1Z6MQ71FKR9Ui3L8P+0xu8DkhhxE11Ogpl+aquBUqGcvlD
0SgpXy+eoeFaRhFXRUkWtH/3XYo+h+N+4jZmgjCLd4+YI+u5tbUGpyBMABmUDiqZ
xcrPGc4cvXExqYePUg6cFCDcjqGCxqSu5BPbA5R+DSTkn5Sc1WQzORJpD5b7pcEq
8msolev88dcmddLXMyWzXQfPHA4vaQD74lr5LIzn6BRjVv+ZB7Y0ZTnnOimDXxn7
Cxqd+1/8ldRis/tO/JWZsMm5ruvCppwCZUdXjSNI5R1OxzVwTVLzsCoiSYPV0agd
a5dQ9wayB6OohBK7+ZU2V3sZwE2xwHdDzfhbdzmI++TxtOurDHbkfkED
-----END CERTIFICATE-----`;

// 2) Yonglin: Chunghwa Telecom GCC R46 OV TLS CA 2025
// Subject: C=TW, O=Chunghwa Telecom Co., Ltd., CN=Chunghwa Telecom GCC R46 OV TLS CA 2025
// Issuer: GlobalSign Root R46 — http://secure.globalsign.com/cacert/chunghwatelecomgccr46ovtlsca2025.crt
const CHT_GCC_R46_OV_TLS_CA_2025 = `-----BEGIN CERTIFICATE-----
MIIGjDCCBHSgAwIBAgIRAIPahvzfiTw6RupZI62VAvkwDQYJKoZIhvcNAQELBQAw
RjELMAkGA1UEBhMCQkUxGTAXBgNVBAoTEEdsb2JhbFNpZ24gbnYtc2ExHDAaBgNV
BAMTE0dsb2JhbFNpZ24gUm9vdCBSNDYwHhcNMjUwNzE2MDMwNzQwWhcNMzAwNzE2
MDAwMDAwWjBkMQswCQYDVQQGEwJUVzEjMCEGA1UEChMaQ2h1bmdod2EgVGVsZWNv
bSBDby4sIEx0ZC4xMDAuBgNVBAMTJ0NodW5naHdhIFRlbGVjb20gR0NDIFI0NiBP
ViBUTFMgQ0EgMjAyNTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMEy
CpDj+rbCK2vUQ/fHKZDM0tSRKDUuru2P7ad/nrcNyPCMjkiKU5DQBLR/5/MfQW8f
HL9XggexUsDTXVfM3xtEdsttZYbQT0qnCM1w7JWPgFPkdLsQ7UrqEQPnELM+rcXN
OmSmXT0u36x6rfZ0YoHM6mIENPmgX9Uh49i3nZ39UyP9k73Bmj2W8X3gnU3iCLQj
VPZoJHhuesgUxDQF6jHNIQYJlO8HY74UgDarVLmF4P/U5bWpxQhweWt33IpXL9zv
BNxfnmdNcvGcDH5JoGs2zQ4VjtDrWxLu4gg+gbYtZl5LO2oAxCrtSdtBJ3WLOkHO
6o170ePJC0CAFbCU8atKf+zlvtxWoDlN3trVFzjx2dDA2JWirnLVZQtzJiE/+5Hc
ir0KgXllW81GYZz+OCNsdqwoC0GTTrAdRfizVQe3+5uIQ/7cWaayEU1M/urPIy2k
x/aq9f0tlbLaWHd5i2qsKKejm44Wzm++GkjaEcNGxh1FTcC5vVH9dwO+gOm36pC/
kchapWNrml8qrYKzSKYQD6jaK7HeMdWvqPdgHxCUZBW+VPrldJJniDya6xOxvDs0
3kw5CpsmmO+bIPJXUT1tZDzl5wEAhFJsgo2+p+UBtm/dIsdfDTYTdx/ccdplxdD3
FGRNjIU3cW0MwpcQRe9H8xiTlL/lcxW8AOmLIWJ5AgMBAAGjggFVMIIBUTAOBgNV
HQ8BAf8EBAMCAYYwEwYDVR0lBAwwCgYIKwYBBQUHAwEwEgYDVR0TAQH/BAgwBgEB
/wIBADAdBgNVHQ4EFgQU8DFry99jlKxApI9wiAx4jiXZTb8wHwYDVR0jBBgwFoAU
A1yrc4GHqMywptWU4jaWSf8FmSwwewYIKwYBBQUHAQEEbzBtMC4GCCsGAQUFBzAB
hiJodHRwOi8vb2NzcC5nbG9iYWxzaWduLmNvbS9yb290cjQ2MDsGCCsGAQUFBzAC
hi9odHRwOi8vc2VjdXJlLmdsb2JhbHNpZ24uY29tL2NhY2VydC9yb290cjQ2LmNy
dDA2BgNVHR8ELzAtMCugKaAnhiVodHRwOi8vY3JsLmdsb2JhbHNpZ24uY29tL3Jv
b3RyNDYuY3JsMCEGA1UdIAQaMBgwCAYGZ4EMAQICMAwGCisGAQQBoDIKAQIwDQYJ
KoZIhvcNAQELBQADggIBAA7Hc3jjUCVoW4sA9fTQ3t6yCEh+D9djwKcg8n1W9cZ6
MvDE2f3FxDWK5HYDlqE1HfXMK0gEC550wGnBmDSDAX11I2wBNZQsT8xWYlnzEwPW
PlPjYPAHExAh/v/QUnJH43dnRPXndajaLekO9s2gwC7cDnt+cn8DdsisTju8xorC
tyESswPK72PXYGtC3UoXE92S9UlMpxYbyY6fwTX4zpJXIIKhTxMFY5IW4aVcQri8
ZNlOovaedXCnyQHrVvETeyRLkQsxFZUdMfe8ZmY2D5ci4HSSeYRBUxYSsxId1keM
SBbKpdZR0FcPWzjT+DH6WwqxgIu+2VfRqPbY5rUI8asVCdTFykus7Fr6jEfQ1wUg
l9HvnxlquhrVuVFuZvL09fQkiaM18hnpTIhJM+cPK4CsutuCA6aHsxT0RU4vIQRg
AM1MC2H4dOTh+lyWqLji0MSMCzoIgeeTWLRN41o8kVXk/neavhYKshDzdM2U0bUE
bslMrb1wfJKddp6jrUIrWN/u+rz/8cZ012zpckXu9nUnQJ1STkMf61b2P1jkyMQg
M4bWh7wi0V64wAz5FGUznXhVD3Ju/IUd6YVU+4ATXcv++QEFmdmrhHzfmhX+sKK/
bo9BR1lD5OZuxGyqm4ToJ7JY81+q7YlNH9XaYO1csna8jHejNoc3WIn2nbIckVpK
-----END CERTIFICATE-----`;

// 3) MOE Family Edu: TWCA SSL Certification Authority & TWCA CYBER Root CA
// Subject: C=TW, O=TAIWAN-CA, OU=SSL Sub-CA, CN=TWCA SSL Certification Authority
// Issuer: TWCA CYBER Root CA -> TWCA Global Root CA
const TWCA_SSL_SUB_CA = `-----BEGIN CERTIFICATE-----
MIIG1DCCBLygAwIBAgIQQAE0sE8AAAAAAAAAA+MkrDANBgkqhkiG9w0BAQwFADBQ
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRswGQYDVQQDExJUV0NBIENZQkVSIFJvb3QgQ0EwHhcNMjMwMjIzMDcyMjI0
WhcNMzMwMjIzMTU1OTU5WjBhMQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FO
LUNBMRMwEQYDVQQLEwpTU0wgU3ViLUNBMSkwJwYDVQQDEyBUV0NBIFNTTCBDZXJ0
aWZpY2F0aW9uIEF1dGhvcml0eTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoC
ggIBAMquxiSlMrxfOO29yqxCo/BIYBswnE7snZnuZDPcx8N9WhOdNGDsF024VjXK
nXoVaZBcv56eFsU+w9Mcq+uIVYzjVrBoe5u8ZLE0hPSkluH8URhcxtSQJ+gXcB0L
JHsseAeXVcgqoxTSJ6/n0xTCeXEnGwSRAzrqTvjS2gbd3TILxsfIHwRgwwPjBDgm
tjzbHHOFTJB3GCtH65T9A0viM2B/IW9Wz73jkz02AVMrZBHQ67IJ2W9CoIjd5mdG
eIV36U9NXl+wZa/D90pLRsFVbItKgLXgF71CQ92vS/biTx8fA6UUCU2ToNczP5Ur
A/mDXCBCLakwa1I3ylRkgFwluJw9DqiYh56MRgsEABa+ZPrm1Qb9njQZK4Y4V+ML
IvGM3xVoHIlvaSN29ubTueLpTeuAwN2VTiRzfOyCRKTcMBCtlMw1WCJNAMiNWDWS
BMnY9SlKv1oujmjS/ti0ptcipMymIoeWpVuQt3Mj8lYlKRpd6Zg8MbljMwQRSClK
6O6MSwpM3Xy5uJGh2cY5oYmKtxfyHSuKtKsk+daAPV1lpWYp9bNrbsLUPwmSY+zk
VgkZdiWBF//RP/72/esANONINy5hkWjkVd0NLjA5TAgk+DVVmnPtQIj1vBgtk8ak
Y9CczIbEgKBonkHWn+GX2ycR6jadg2P+xrBFg4MGjomkb2gtAgMBAAGjggGXMIIB
kzAfBgNVHSMEGDAWgBSdhWEUfMFib5do5E83QOGt4A1WNzAdBgNVHQ4EFgQU8ijU
+dQcfhprFoLl75Mpae3KFSAwDgYDVR0PAQH/BAQDAgEGMBMGA1UdJQQMMAoGCCsG
AQUFBwMBMEoGA1UdIARDMEEwNQYLKwYBBAGCvyUBARUwJjAkBggrBgEFBQcCARYY
aHR0cHM6Ly93d3cudHdjYS5jb20udHcvMAgGBmeBDAECAjBNBgNVHR8ERjBEMEKg
QKA+hjxodHRwOi8vUm9vdENBLnR3Y2EuY29tLnR3L1RXQ0FSQ0EvY3liZXJfcm9v
dF9yZXZva2VfMjAyMi5jcmwwEgYDVR0TAQH/BAgwBgEB/wIBADB9BggrBgEFBQcB
AQRxMG8wQwYIKwYBBQUHMAKGN2h0dHA6Ly9zc2xzZXJ2ZXIudHdjYS5jb20udHcv
Y2FjZXJ0L2N5YmVyX3Jvb3RfMjAyMi5jcnQwKAYIKwYBBQUHMAGGHGh0dHA6Ly9y
b290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZIhvcNAQEMBQADggIBAIFF/6Gnvu8L
3xQDIampB8QVgoKS2bcjte0uJBbCrQHpzcGTuVTkZaiA86LwVz6SAU7TVgVYRXmt
x8l29WzfKI6wOAzmvlGZxSYAdN0I6YBkJK1nmDs0+TSw5lCzb+UOpajNOaMdJ5SN
YTN87yRwl82AFrwUmSLaMV4tN7W49N0SsELWs/d4uNHSMM0mBjd0hLDIWJFwOkuD
yOWahnCVfPlCwSVWpUntOGgOHOA02IUE+JNX+spIV1SwAMYaEVyHe316YUgiGA5y
k3liTa3vuv06eE1J2yiWrs9booW2VTHD+amzucFFNN1KvSLjSbYxG1t/FclHEN/y
6hGM3bkjRC31A0jzpv93D3MUQTdJascicPa0H4i8hviRriyetaC6HC4q8FQUTo2A
cEpxicNGgyHhDV+YdbnS6GZL+f3bsmMM8ZFYZ77mDTS9mRO1VnIwkjiN4vpzh67a
KTpoD9TQzZcGQiJy6Pi+PCSFiqjK7UD/63L/Pt0hpoNKvZLrz4ngrlpyzpx8KjeS
A5cjKcc6vlHm0Kk07k5djhJsaqQELso5r+UXi9qC+nwqPuR/w5kJZv4fz0ND4UhY
5y3qd+iCikkF3WzOzey7jUH9URKb3iZnRAHZvmyLK57UI0FwP+5xZEByvwXDtxbe
914Hj3cSUrmKT3g/ZlOQQ1THeu48MA79
-----END CERTIFICATE-----`;

const TWCA_CYBER_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIGUTCCBDmgAwIBAgIQQAE0jRkAAAAAAAAMzfmTejANBgkqhkiG9w0BAQwFADBR
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRwwGgYDVQQDExNUV0NBIEdsb2JhbCBSb290IENBMB4XDTIyMTIwOTA0MDAy
N1oXDTMwMTIwOTE1NTk1OVowUDELMAkGA1UEBhMCVFcxEjAQBgNVBAoTCVRBSVdB
Ti1DQTEQMA4GA1UECxMHUm9vdCBDQTEbMBkGA1UEAxMSVFdDQSBDWUJFUiBSb290
IENBMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAxvjKHtkJIH4dbE7O
j+NHM0Scx8lpqjpbeO5w0pL4BLNSUh1nciih34tdlQr+6s3t9ynO8G9/rM0977Mc
RWr3KJDxYVfFDMSjUF3e1LXLGcqAuXXOKc7ShSLsAmPMRDAg2uqRW1bmHRzVnWbH
P9+GyktTxNmNsh3q+NwnU6NH4WHMfbWw+O5zkcXOc2/O7hAfGgbP6SdgxU8Z5OvO
IiZF12CZ3c5PN+B/52OtsLhZuNAGaDVg0zaucUME8WlleHzzH/PKKJ9aIJVmtM23
7o94pEUY6SYvjZspKLGktzptudQcOHJFWLFe6/Aom7eCyv3P1jMPn/uXnrEcnJ7q
X17bqt1U6TAhKG2OefN1kowm/tzF9sOw30RZQ6O2Ayj2CDCqDTPh75ypByLjWVtA
j9qIt2kIqLcjLkQJWTdbx+MX8iLrbjlSxd5Up5jJSyCV3EaJX7QS+YUpjuvIJxUg
wEvUzHwMbDQMJpsmMaY8p/bZ0EuiZP87mUFyweBwl/EkuyvEdCKxrGsiMiTTeCrA
wKEv8VIFyT/vdmbiRdgNPa2VyMeJJsgPrqcDLvvBX/og4XCtsGUgNzNgsNWv1wwc
wpBw10oYvH4BsLDrFR5EBs2kT+gM0cMgEOFUZZ62UdAadmtCWlh2NOq3NxmuLnX5
luXBWfeUVykljTpMq02aQdBfJgMCAwEAAaOCASQwggEgMB8GA1UdIwQYMBaAFEjb
zd6O6UlyWojosdg9B7O5a2ZQMB0GA1UdDgQWBBSdhWEUfMFib5do5E83QOGt4A1W
NzAOBgNVHQ8BAf8EBAMCAQYwOAYDVR0gBDEwLzAtBgRVHSAAMCUwIwYIKwYBBQUH
AgEWF2h0dHA6Ly93d3cudHdjYS5jb20udHcvMEkGA1UdHwRCMEAwPqA8oDqGOGh0
dHA6Ly9Sb290Q0EudHdjYS5jb20udHcvVFdDQVJDQS9nbG9iYWxfcmV2b2tlXzQw
OTYuY3JsMA8GA1UdEwEB/wQFMAMBAf8wOAYIKwYBBQUHAQEELDAqMCgGCCsGAQUF
BzABhhxodHRwOi8vcm9vdG9jc3AudHdjYS5jb20udHcvMA0GCSqGSIb3DQEBDAUA
A4ICAQAIV8IXIYBEmjNLVZ3cykhYdpSXL16BQ/6wRv354pWCZdCZFYdWGHwUlfTT
7IcduMqWXjXHp+xKjhVBvKzaOQWhPwUnsLY6yFV4383WJ03eoEwWSoHeDb5BHbd
ZNxVOivE/T2N9K7vuW7aLyrZiL4ofzn3md21sdRLWtE+hWe4CpHDdg+PgijvZalu
0itou3jwNoSNCSGziirvxug3FzI1zOj+vJgB779iF/P70/UJRsqF4J61bai4fBHh
cIsKt5QcaUCjpE9FDdZRxoNOvYErfliYuZgQ6eGqAWokuB6/0a6e0mCNFIvLmnzd
q7m4k9hzm8aLX9LxSViIcmIX9pZe7UeV94xAI2WsALT92cYwniD5CehGDCp8VWA5
U9OverI59e/LNP2LBR0moeYKw4GI0cV981cuQTYy0KnYIsBgZOEuGwuq/9HmHjYc
plJmBzApLHhcTJA+1ly2xN2i/aVPF2fQnd15Pe/44gHwT+R+j4RjkWsdVEWJrnNG
jYvNU+XP7uEUViUB+nEv8Fk0owO1pDaK1NaekccbSA+6uFiJ+hpG1D/niKWuuA+e
NyP6bE31WxRd+wSWZpCq1OQjjdpbmPs7bfa6NraTrIDJZ97K+z6sOKHRrB8yoLIk
9ZXOcMacd8HWlFxlyMK4U6dIOgrKwu+h1QRtavwsCIhWpAf3bew==
-----END CERTIFICATE-----`;

const TRUSTED_CAS = [
  ...tls.rootCertificates,
  TWCA_SECURE_SSL_INTERMEDIATE_CA,
  CHT_GCC_R46_OV_TLS_CA_2025,
  TWCA_SSL_SUB_CA,
  TWCA_CYBER_ROOT_CA,
];

// issue #401 / #699: passing `ca: TRUSTED_CAS` (Node's ~120-cert root store + 4
// project PEMs) forces a brand-new tls.SecureContext to be built from native
// code for EVERY TLS connection — and that holds even when the `ca` list sits
// on a shared keep-alive Agent, because the Agent only forwards the option to
// tls.connect(), which builds a context per socket. Measured on Node 20/26
// (scratch benchmark for #699): ~0.8 MB of native memory per context, 150
// connections = +110-125 MB RSS, while process.memoryUsage().external moves by
// 0.1 MB — V8 cannot see it, so it never decides to collect, and a context
// stays alive as long as its (keep-alive!) socket does. Three std::bad_alloc
// crashes on 2026-09-23 (SecureContext::AddCACert) and the SIGKILLs ~3 minutes
// into every RSS ingestion run on 2026-10-16 (the run touches ~100 distinct
// hosts) are the same mechanism. The fix is to build ONE SecureContext here,
// at module load, and hand that object to the Agent: the same 150
// connections then cost +4 MB. `ca` is deliberately not passed any more.
const SHARED_SECURE_CONTEXT = tls.createSecureContext({ ca: TRUSTED_CAS });

/**
 * An idle keep-alive socket is closed after this long. Without it the agent
 * keeps every socket until the *remote* end closes it (a minute or more for
 * most origins), and each one pins TLS session state — one per publisher the
 * ingestion has visited. Requests to the same host come in bursts of a few
 * seconds, so 10 s keeps the reuse and drops the rest.
 */
const IDLE_SOCKET_TIMEOUT_MS = 10_000;

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: IDLE_SOCKET_TIMEOUT_MS,
  secureContext: SHARED_SECURE_CONTEXT,
});
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: IDLE_SOCKET_TIMEOUT_MS,
});

/** Test seam: lets a test assert the agents share one SecureContext and expire idle sockets. */
export const httpAgentsForTests = { httpsAgent, httpAgent, secureContext: SHARED_SECURE_CONTEXT };

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  body?: string;
  /**
   * Hard ceiling on the response body, in bytes. The socket is destroyed as soon
   * as the limit is passed, so an oversized or hostile response can never become
   * resident. Defaults to DEFAULT_MAX_RESPONSE_BYTES.
   *
   * This matters more here than on a normal host: production runs under a ~768MB
   * V8 heap cap, and every caller's own size check (MAX_IMAGE_BYTES and friends)
   * runs only *after* the full body has already been buffered.
   */
  maxResponseBytes?: number;
  /**
   * Read at most this many bytes of the body and then stop, instead of failing
   * (maxResponseBytes) or reading to the end. The socket is dropped as soon as
   * enough has arrived and the result is flagged `truncated`.
   *
   * For callers that only need the start of a document — og:image lives in
   * <head>, so reading and parsing a 1.5 MB news page to find it costs ~75 MB of
   * DOM for nothing (measured for #699). Asks the origin for an uncompressed
   * body (a cut-off gzip stream cannot be parsed); if it compresses anyway the
   * stream is decoded as far as it goes. Not for anything that must be complete.
   */
  truncateAtBytes?: number;
}

/** 24MB — comfortably above the largest article image we fetch, far below the heap cap. */
export const DEFAULT_MAX_RESPONSE_BYTES = 24 * 1024 * 1024;

/**
 * A decompressed body may be this many times the wire limit. JSON and CSV open-data
 * dumps legitimately inflate 10:1, so the guard is loose on purpose — it exists to
 * stop a gzip bomb, not to second-guess a big dataset.
 */
const MAX_DECODE_RATIO = 8;

export class ResponseTooLargeError extends Error {
  constructor(url: string, limit: number) {
    super(`Response body exceeded ${limit} bytes: ${url}`);
    this.name = "ResponseTooLargeError";
  }
}

export interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  buffer: Buffer;
  /** True when the body was cut at `truncateAtBytes`; `buffer` is then only the start of the document. */
  truncated?: boolean;
}

/**
 * Decompresses a response body, never producing more than `maxOutputBytes`.
 *
 * maxResponseBytes only bounds what comes off the wire; a 10 MB gzip stream can
 * inflate to gigabytes, and the unbounded call used to try. An over-limit body
 * now surfaces as ResponseTooLargeError (like an over-limit download), while any
 * other decoding problem still falls back to the raw bytes as before.
 *
 * `partial` decodes as far as a cut-off stream goes (Z_SYNC_FLUSH instead of
 * demanding a complete trailer) — used for truncated reads only.
 */
const decodeBody = (
  buffer: Buffer,
  contentEncoding: string | undefined,
  url: string,
  maxOutputBytes: number,
  partial: boolean,
): Buffer => {
  const common = {
    maxOutputLength: Math.max(1, maxOutputBytes),
    ...(partial ? { finishFlush: zlib.constants.Z_SYNC_FLUSH } : {}),
  };
  try {
    if (contentEncoding === "gzip") return zlib.gunzipSync(buffer, common);
    if (contentEncoding === "deflate") return zlib.inflateSync(buffer, common);
    if (contentEncoding === "br") {
      return zlib.brotliDecompressSync(buffer, {
        maxOutputLength: common.maxOutputLength,
        ...(partial ? { finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH } : {}),
      });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ERR_BUFFER_TOO_LARGE") {
      throw new ResponseTooLargeError(url, maxOutputBytes);
    }
    // Fall through and return the raw buffer if decompression fails.
  }
  return buffer;
};

/**
 * Collects a response body into ONE buffer.
 *
 * `Buffer.concat(chunks)` holds every chunk and the joined copy at the same time,
 * so a 12 MB image needs 24 MB at its peak. When the origin declared a
 * Content-Length the right-sized buffer is allocated up front and each chunk is
 * copied in and dropped; without one (chunked encoding) it falls back to concat.
 */
const createBodyCollector = (declaredLength: number) => {
  const preallocated =
    Number.isFinite(declaredLength) && declaredLength > 0
      ? Buffer.allocUnsafe(declaredLength)
      : null;
  let chunks: Buffer[] = [];
  let received = 0;
  let overflowed = false;

  return {
    get received() {
      return received;
    },
    push(chunk: Buffer): void {
      if (preallocated && !overflowed && received + chunk.length <= preallocated.length) {
        chunk.copy(preallocated, received);
      } else {
        if (preallocated && !overflowed) {
          // The origin sent more than it declared: keep what we have and carry on with a list.
          overflowed = true;
          chunks = [Buffer.from(preallocated.subarray(0, received))];
        }
        chunks.push(chunk);
      }
      received += chunk.length;
    },
    finish(maxBytes?: number): Buffer {
      const whole =
        preallocated && !overflowed
          ? preallocated.subarray(0, received)
          : Buffer.concat(chunks);
      chunks = [];
      return maxBytes !== undefined && whole.length > maxBytes
        ? whole.subarray(0, maxBytes)
        : whole;
    },
  };
};

const requestOnce = (
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponse> =>
  new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }

    const transport = parsed.protocol === "http:" ? http : https;
    const truncateAt = options.truncateAtBytes;
    const req = transport.request(
      parsed,
      {
        method: options.method ?? "GET",
        headers: {
          "Accept-Encoding": truncateAt ? "identity" : "gzip, deflate, br",
          // Cloudflare-fronted origins (Pixabay's CDN, in particular) rate-limit
          // or challenge requests with no User-Agent much more aggressively than
          // ones that look like a normal browser — confirmed live: the exact
          // same URL succeeded via curl (which sends a default UA) and failed
          // with HTTP 429 "Rate limit exceeded" via plain Node https without one.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          ...options.headers,
        },
        timeout: options.timeoutMs ?? 15_000,
        agent: parsed.protocol === "https:" ? httpsAgent : httpAgent,
      },
      (res) => {
        const limit = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

        // Trust Content-Length when the origin sends one — this rejects an
        // oversized download before a single byte of it is buffered. (A
        // truncating read never fails on size: it simply stops early.)
        const declared = Number(res.headers["content-length"]);
        if (!truncateAt && Number.isFinite(declared) && declared > limit) {
          res.destroy();
          reject(new ResponseTooLargeError(url, limit));
          return;
        }

        const body = createBodyCollector(
          truncateAt ? Number.NaN : declared,
        );
        let aborted = false;

        const settle = (wasTruncated: boolean) => {
          const contentEncoding = res.headers["content-encoding"];
          try {
            const raw = body.finish(truncateAt && !contentEncoding ? truncateAt : undefined);
            let decoded: Buffer;
            let truncatedResult = wasTruncated;
            try {
              // A compressed truncated read decodes as far as it goes; the
              // decoded size is bounded to a multiple of what we asked for.
              decoded = decodeBody(
                raw,
                contentEncoding,
                url,
                (truncateAt ?? limit) * MAX_DECODE_RATIO,
                wasTruncated,
              );
            } catch (error) {
              // A truncating caller only wanted the start of the document; one
              // that inflates past the guard yields nothing rather than failing.
              if (!truncateAt || !(error instanceof ResponseTooLargeError)) throw error;
              decoded = Buffer.alloc(0);
              truncatedResult = true;
            }
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              buffer: decoded,
              ...(truncatedResult ? { truncated: true } : {}),
            });
          } catch (error) {
            // Thrown from inside an event handler would be an uncaught exception.
            reject(error);
          }
        };

        res.on("data", (chunk: Buffer) => {
          if (aborted) return;
          if (truncateAt) {
            body.push(chunk);
            if (body.received >= truncateAt) {
              aborted = true;
              // Enough of the document has arrived; drop the connection rather than download the rest.
              res.destroy();
              settle(true);
            }
            return;
          }
          if (body.received + chunk.length > limit) {
            aborted = true;
            res.destroy();
            reject(new ResponseTooLargeError(url, limit));
            return;
          }
          body.push(chunk);
        });
        res.on("end", () => {
          if (aborted) return;
          settle(false);
        });
        res.on("error", (error) => {
          if (aborted) return;
          reject(error);
        });
      },
    );

    req.on("timeout", () =>
      req.destroy(new Error(`Request timed out: ${url}`)),
    );
    req.on("error", reject);

    if (options.body) req.write(options.body);
    req.end();
  });

export const httpRequest = async (
  url: string,
  options: HttpRequestOptions = {},
): Promise<HttpResponse> => {
  let currentUrl = url;
  let redirectsLeft = options.maxRedirects ?? 5;

  for (;;) {
    const response = await requestOnce(currentUrl, options);
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);

    if (isRedirect && response.headers.location && redirectsLeft > 0) {
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      redirectsLeft -= 1;
      continue;
    }

    return response;
  }
};

export const httpGetText = async (
  url: string,
  options: HttpRequestOptions = {},
): Promise<{ status: number; text: string; truncated?: boolean }> => {
  const response = await httpRequest(url, options);
  return {
    status: response.status,
    text: response.buffer.toString("utf-8"),
    ...(response.truncated ? { truncated: true } : {}),
  };
};

export const httpGetJson = async <T = unknown>(
  url: string,
  options: HttpRequestOptions = {},
): Promise<{ status: number; data: T }> => {
  const { status, text } = await httpGetText(url, options);
  return { status, data: JSON.parse(text) as T };
};

export const httpPostForm = async <T = unknown>(
  url: string,
  form: Record<string, string>,
  options: HttpRequestOptions = {},
): Promise<{ status: number; data: T }> => {
  const body = new URLSearchParams(form).toString();
  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    "content-length": String(Buffer.byteLength(body)),
    ...(options.headers || {}),
  };
  const response = await httpRequest(url, {
    ...options,
    method: "POST",
    headers,
    body,
  });
  return {
    status: response.status,
    data: JSON.parse(response.buffer.toString("utf-8")) as T,
  };
};
