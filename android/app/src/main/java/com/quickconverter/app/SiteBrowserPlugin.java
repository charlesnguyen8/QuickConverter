package com.quickconverter.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.UserAgentMetadata;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONObject;

@CapacitorPlugin(name = "SiteBrowser")
public class SiteBrowserPlugin extends Plugin {

    private static final int BACKGROUND = Color.parseColor("#0f172a");
    private static final int BAR = Color.parseColor("#1e293b");
    private static final int TEXT = Color.parseColor("#e2e8f0");
    private static final int ACCENT = Color.parseColor("#6366f1");

    private FrameLayout overlay;
    private WebView site;
    private TextView titleView;
    private View appView;
    private String script = "";
    private boolean shown = false;
    private OnBackPressedCallback backCallback;

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Only web pages can be opened");
            return;
        }
        String nextScript = call.getString("script", "");
        boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", false));
        String userAgent = call.getString("userAgent", "");
        getActivity().runOnUiThread(() -> {
            ensureViews();
            if (userAgent != null && !userAgent.isEmpty()) site.getSettings().setUserAgentString(userAgent);
            script = nextScript == null ? "" : nextScript;
            titleView.setText(Uri.parse(url).getHost());
            site.loadUrl(url);
            setShown(visible);
            call.resolve();
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (overlay != null) setShown(true);
            call.resolve();
        });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (overlay != null) setShown(false);
            call.resolve();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            closeSite();
            call.resolve();
        });
    }

    private void closeSite() {
        if (overlay == null) return;
        script = "";
        setShown(false);
        site.stopLoading();
        site.loadUrl("about:blank");
        CookieManager.getInstance().flush();
    }

    private void closeByUser() {
        closeSite();
        emit("{\"type\":\"closed\"}");
    }

    private void emit(String json) {
        JSObject event = new JSObject();
        event.put("data", json);
        notifyListeners("event", event);
    }

    private void setShown(boolean visible) {
        shown = visible;
        if (visible) {
            overlay.bringToFront();
        } else if (appView != null) {
            appView.bringToFront();
        }
        overlay.requestLayout();
        overlay.invalidate();
        if (backCallback != null) {
            backCallback.remove();
            backCallback.setEnabled(visible);
            if (visible) getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), backCallback);
        }
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getContext().getResources().getDisplayMetrics());
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private void ensureViews() {
        if (overlay != null) return;
        ViewGroup content = getActivity().findViewById(android.R.id.content);
        appView = content.getChildCount() > 0 ? content.getChildAt(0) : null;

        overlay = new FrameLayout(getContext());
        overlay.setBackgroundColor(BACKGROUND);
        overlay.setClickable(true);

        LinearLayout column = new LinearLayout(getContext());
        column.setOrientation(LinearLayout.VERTICAL);

        LinearLayout bar = new LinearLayout(getContext());
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BAR);
        bar.setPadding(dp(16), 0, dp(8), 0);

        titleView = new TextView(getContext());
        titleView.setTextColor(TEXT);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);
        bar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button closeButton = new Button(getContext());
        closeButton.setText("Close");
        closeButton.setAllCaps(false);
        closeButton.setTextColor(Color.WHITE);
        closeButton.setBackgroundColor(ACCENT);
        closeButton.setMinHeight(dp(40));
        closeButton.setMinimumHeight(dp(40));
        closeButton.setOnClickListener((v) -> closeByUser());
        bar.addView(closeButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)));

        column.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

        site = new WebView(getContext());
        WebSettings settings = site.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString().replace("; wv", ""));
        looksLikeChrome(settings);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(site, true);
        site.addJavascriptInterface(new PageBridge(), "QCSiteBrowser");
        site.setWebChromeClient(new WebChromeClient());
        site.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("http".equals(scheme) || "https".equals(scheme));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url == null || url.startsWith("about:")) return;
                titleView.setText(Uri.parse(url).getHost());
                if (!script.isEmpty()) view.evaluateJavascript(script, null);
                try {
                    JSONObject page = new JSONObject();
                    page.put("type", "page");
                    page.put("url", url);
                    emit(page.toString());
                } catch (Exception ignored) {}
            }
        });
        column.addView(site, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        overlay.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(overlay, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
        content.addView(overlay, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.requestApplyInsets(overlay);

        backCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                if (site.canGoBack()) site.goBack();
                else closeByUser();
            }
        };
    }

    private void looksLikeChrome(WebSettings settings) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, Collections.emptySet());
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
            UserAgentMetadata current = WebSettingsCompat.getUserAgentMetadata(settings);
            List<UserAgentMetadata.BrandVersion> brands = new ArrayList<>();
            for (UserAgentMetadata.BrandVersion brand : current.getBrandVersionList()) {
                if ("Android WebView".equals(brand.getBrand())) {
                    brands.add(new UserAgentMetadata.BrandVersion.Builder(brand).setBrand("Google Chrome").build());
                } else {
                    brands.add(brand);
                }
            }
            WebSettingsCompat.setUserAgentMetadata(settings, new UserAgentMetadata.Builder(current).setBrandVersionList(brands).build());
        }
    }

    private class PageBridge {
        @JavascriptInterface
        public void post(String json) {
            if (json == null || json.length() > 8 * 1024 * 1024) return;
            emit(json);
        }
    }
}
