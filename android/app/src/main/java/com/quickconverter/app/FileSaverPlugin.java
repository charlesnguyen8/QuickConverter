package com.quickconverter.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private OutputStream out;
    private Uri uri;

    @PluginMethod
    public void begin(PluginCall call) {
        closeQuietly();
        uri = null;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("fileName", "file"));
        startActivityForResult(call, intent, "onDocumentCreated");
    }

    @ActivityCallback
    private void onDocumentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("created", false);
            call.resolve(ret);
            return;
        }
        uri = data.getData();
        try {
            out = getContext().getContentResolver().openOutputStream(uri, "wt");
            if (out == null) throw new IOException("No output stream");
            JSObject ret = new JSObject();
            ret.put("created", true);
            call.resolve(ret);
        } catch (Exception e) {
            uri = null;
            call.reject("Could not open the file for writing", e);
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        if (out == null) {
            call.reject("No file is open");
            return;
        }
        try {
            out.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (IOException e) {
            call.reject("Could not write the file", e);
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        if (out == null) {
            call.reject("No file is open");
            return;
        }
        try {
            out.flush();
            out.close();
            out = null;
            uri = null;
            call.resolve();
        } catch (IOException e) {
            out = null;
            call.reject("Could not finish the file", e);
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        closeQuietly();
        if (uri != null) {
            try {
                DocumentsContract.deleteDocument(getContext().getContentResolver(), uri);
            } catch (Exception ignored) {}
            uri = null;
        }
        call.resolve();
    }

    private void closeQuietly() {
        if (out == null) return;
        try {
            out.close();
        } catch (IOException ignored) {}
        out = null;
    }
}
