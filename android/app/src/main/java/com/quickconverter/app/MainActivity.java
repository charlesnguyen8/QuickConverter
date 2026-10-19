package com.quickconverter.app;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuthPlugin.class);
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(SiteBrowserPlugin.class);
        registerPlugin(ScreenPlugin.class);
        registerPlugin(BackgroundWorkPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }
}
