package com.myanston.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AnstonAppPlugin.class);
        super.onCreate(savedInstanceState);
        // Opened by tapping a myanston.com link: show that page instead of the home page.
        openAnstonLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // A myanston.com link was tapped while the app was already open.
        openAnstonLink(intent);
    }

    private void openAnstonLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri link = intent.getData();
        if (link == null || !"https".equals(link.getScheme())) return;
        String host = link.getHost();
        if (!"myanston.com".equals(host) && !"www.myanston.com".equals(host)) return;
        if (bridge == null) return;
        final WebView webView = bridge.getWebView();
        if (webView == null) return;
        final String url = link.toString();
        webView.post(() -> webView.loadUrl(url));
    }
}
