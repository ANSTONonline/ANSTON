package com.myanston.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Small plugin myanston.com can ask about the app:
//   Capacitor.nativePromise("AnstonApp", "info") -> { pushReady: boolean }
@CapacitorPlugin(name = "AnstonApp")
public class AnstonAppPlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        // Firebase (needed for notifications) is only set up when google-services.json
        // was included in the build. Without it, asking for a push token would crash.
        boolean pushReady = getContext().getResources()
            .getIdentifier("google_app_id", "string", getContext().getPackageName()) != 0;
        JSObject result = new JSObject();
        result.put("pushReady", pushReady);
        call.resolve(result);
    }
}
