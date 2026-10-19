package com.quickconverter.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundWork")
public class BackgroundWorkPlugin extends Plugin {

    private boolean askedForNotifications = false;

    @PluginMethod
    public void hold(PluginCall call) {
        String text = call.getString("text", "Downloading chapters");
        Context context = getContext();
        askForNotifications();
        if (DownloadService.running) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            manager.notify(DownloadService.NOTIFICATION_ID, DownloadService.build(context, text));
            call.resolve();
            return;
        }
        try {
            Intent intent = new Intent(context, DownloadService.class).putExtra(DownloadService.EXTRA_TEXT, text);
            ContextCompat.startForegroundService(context, intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not keep downloading in the background", e);
        }
    }

    @PluginMethod
    public void release(PluginCall call) {
        getContext().stopService(new Intent(getContext(), DownloadService.class));
        call.resolve();
    }

    private void askForNotifications() {
        if (askedForNotifications || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        askedForNotifications = true;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4102);
        }
    }
}
