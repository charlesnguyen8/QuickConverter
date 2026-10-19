package com.quickconverter.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuthPlugin.class);
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(SiteBrowserPlugin.class);
        registerPlugin(ScreenPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
