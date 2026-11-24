#!/usr/bin/env bash
# Called by .github/workflows/android-screenshots.yml once the emulator is up.
set -u
APP=com.myanston.app
APK=mobile/android/app/build/outputs/apk/debug/app-debug.apk
mkdir -p shots

# Clean status bar for store screenshots: 9:41, full battery and signal.
adb shell settings put global sysui_demo_allowed 1
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
demo enter
demo clock -e hhmm 0941
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4
demo network -e mobile show -e datatype none -e level 4
demo notifications -e visible false

adb install -r "$APK"
adb logcat -c

shot() { adb exec-out screencap -p > "shots/$1.png"; echo "saved $1"; }

# First launch: splash screen, then myanston.com.
adb shell am start -W -n "$APP/.MainActivity"
sleep 30
shot 01-home

# Debug access to the app's web view (debug builds only), for checks below.
js() {
  local sock
  sock=$(adb shell cat /proc/net/unix | tr -d '\r' | grep -o 'webview_devtools_remote_[0-9]*' | tail -1)
  if [ -z "$sock" ]; then echo "n/a (no debug socket)"; return; fi
  adb forward tcp:9222 "localabstract:$sock" >/dev/null
  node mobile/scripts/webview-eval.mjs "$1"
}
echo "CHECK app user agent ends with AnstonApp: $(js 'navigator.userAgent.endsWith("AnstonApp")')"

# Open other pages the same way a tapped myanston.com link would.
n=2
for path in browse how-it-works pricing sell account faq; do
  adb shell am start -W -n "$APP/.MainActivity" -a android.intent.action.VIEW -d "https://www.myanston.com/$path"
  sleep 15
  shot "$(printf '%02d' $n)-$path"
  echo "CHECK $path opened: $(js 'location.pathname')"
  if [ "$path" = account ]; then
    echo "CHECK Google sign-in hidden in app: $(js '!document.body.innerHTML.includes("0 0 48 48")')"
    echo "CHECK service worker off in app: $(js '!navigator.serviceWorker.controller')"
  fi
  n=$((n + 1))
done

# Scroll the home page for one more shot.
adb shell am start -W -n "$APP/.MainActivity" -a android.intent.action.VIEW -d "https://www.myanston.com/"
sleep 12
adb shell input swipe 540 1500 540 500 400
sleep 3
shot "$(printf '%02d' $n)-home-scrolled"

# Android back button should go back a page, not close the app.
adb shell input keyevent KEYCODE_BACK
sleep 4
adb shell dumpsys activity activities | grep -q "topResumedActivity.*$APP" && echo "back button: app still open" || echo "back button: app closed"

adb logcat -d | grep -iE "capacitor|chromium|AndroidRuntime" | tail -200 > shots/logcat.txt
