package com.quickconverter.app;

import android.accounts.Account;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private static final String DEFAULT_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        consentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onConsentResult
        );
    }

    private AuthorizationClient client() {
        return Identity.getAuthorizationClient(getActivity());
    }

    private List<Scope> scopesOf(PluginCall call) {
        List<Scope> scopes = new ArrayList<>();
        JSArray requested = call.getArray("scopes");
        if (requested != null) {
            try {
                for (Object scope : requested.toList()) scopes.add(new Scope(String.valueOf(scope)));
            } catch (Exception ignored) {}
        }
        if (scopes.isEmpty()) scopes.add(new Scope(DEFAULT_SCOPE));
        return scopes;
    }

    private AuthorizationRequest requestOf(List<Scope> scopes) {
        return AuthorizationRequest.builder().setRequestedScopes(scopes).build();
    }

    private void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) {
            call.reject("No Google auth token returned");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        call.resolve(ret);
    }

    @PluginMethod
    public void getAccessToken(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        client()
            .authorize(requestOf(scopesOf(call)))
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(call, result);
                    return;
                }
                if (!interactive || result.getPendingIntent() == null) {
                    call.reject("Not signed in to Google", "NOT_SIGNED_IN");
                    return;
                }
                if (pendingCall != null) {
                    call.reject("Google sign-in is already open");
                    return;
                }
                pendingCall = call;
                consentLauncher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
            })
            .addOnFailureListener(e -> call.reject(messageOf(e, "Google sign-in failed"), e));
    }

    private void onConsentResult(ActivityResult activityResult) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        try {
            AuthorizationResult result = client().getAuthorizationResultFromIntent(activityResult.getData());
            resolveToken(call, result);
        } catch (ApiException e) {
            call.reject("You did not approve Google sign-in", e);
        }
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.resolve();
            return;
        }
        client()
            .clearToken(ClearTokenRequest.builder().setToken(token).build())
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(e -> call.resolve());
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        List<Scope> scopes = scopesOf(call);
        client()
            .authorize(requestOf(scopes))
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    call.resolve();
                    return;
                }
                if (result.getAccessToken() != null) {
                    client().clearToken(ClearTokenRequest.builder().setToken(result.getAccessToken()).build());
                }
                GoogleSignInAccount signedIn = result.toGoogleSignInAccount();
                Account account = signedIn != null ? signedIn.getAccount() : null;
                if (account == null) {
                    call.resolve();
                    return;
                }
                client()
                    .revokeAccess(RevokeAccessRequest.builder().setAccount(account).setScopes(scopes).build())
                    .addOnSuccessListener(unused -> call.resolve())
                    .addOnFailureListener(e -> call.reject(messageOf(e, "Google sign-out failed"), e));
            })
            .addOnFailureListener(e -> call.resolve());
    }

    private static String messageOf(Exception e, String fallback) {
        String message = e != null ? e.getMessage() : null;
        return message != null && !message.isEmpty() ? message : fallback;
    }
}
