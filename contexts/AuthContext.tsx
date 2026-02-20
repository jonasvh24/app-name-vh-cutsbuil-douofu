
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { authClient, setBearerToken, clearAuthTokens } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function openOAuthPopup(provider: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popupUrl = `${window.location.origin}/auth-popup?provider=${provider}`;
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      popupUrl,
      "oauth-popup",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup) {
      reject(new Error("Failed to open popup. Please allow popups."));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success" && event.data?.token) {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        resolve(event.data.token);
      } else if (event.data?.type === "oauth-error") {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        reject(new Error(event.data.error || "OAuth failed"));
      }
    };

    window.addEventListener("message", handleMessage);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handleMessage);
        reject(new Error("Authentication cancelled"));
      }
    }, 500);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();

    // Listen for deep links (e.g. from social auth redirects)
    const subscription = Linking.addEventListener("url", (event) => {
      console.log("Deep link received, refreshing user session");
      // Allow time for the client to process the token if needed
      setTimeout(() => fetchUser(), 500);
    });

    // POLLING: Refresh session every 5 minutes to keep SecureStore token in sync
    // This prevents 401 errors when the session token rotates
    const intervalId = setInterval(() => {
      console.log("Auto-refreshing user session to sync token...");
      fetchUser();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      subscription.remove();
      clearInterval(intervalId);
    };
  }, []);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const session = await authClient.getSession();
      console.log("[AuthContext] fetchUser - session data:", session);
      
      if (session?.data?.user) {
        setUser(session.data.user as User);
        // Sync token to SecureStore for utils/api.ts
        if (session.data.session?.token) {
          console.log("[AuthContext] Syncing bearer token to storage");
          await setBearerToken(session.data.session.token);
        }
      } else {
        console.log("[AuthContext] No user session found");
        setUser(null);
        await clearAuthTokens();
      }
    } catch (error) {
      console.error("[AuthContext] Failed to fetch user:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      console.log("[AuthContext] Attempting email sign in for:", email);
      const result = await authClient.signIn.email({ 
        email, 
        password,
        fetchOptions: {
          onSuccess: async (ctx) => {
            console.log("[AuthContext] Sign in success, context:", ctx);
          },
          onError: (ctx) => {
            console.error("[AuthContext] Sign in error:", ctx.error);
          }
        }
      });
      
      console.log("[AuthContext] Sign in result:", result);
      
      // Extract token from the response
      if (result?.data?.session?.token) {
        console.log("[AuthContext] Storing bearer token from sign-in response");
        await setBearerToken(result.data.session.token);
      }
      
      // Fetch user to update state
      await fetchUser();
      console.log("[AuthContext] Email sign in completed successfully");
    } catch (error: any) {
      console.error("[AuthContext] Email sign in failed:", error);
      // Better Auth returns errors in a specific format
      const errorMessage = error?.message || error?.error?.message || "Sign in failed";
      throw new Error(errorMessage);
    }
  };

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    try {
      console.log("[AuthContext] Attempting email sign up for:", email);
      const result = await authClient.signUp.email({
        email,
        password,
        name,
        fetchOptions: {
          onSuccess: async (ctx) => {
            console.log("[AuthContext] Sign up success, context:", ctx);
          },
          onError: (ctx) => {
            console.error("[AuthContext] Sign up error:", ctx.error);
          }
        }
      });
      
      console.log("[AuthContext] Sign up result:", result);
      
      // Extract token from the response
      if (result?.data?.session?.token) {
        console.log("[AuthContext] Storing bearer token from sign-up response");
        await setBearerToken(result.data.session.token);
      }
      
      await fetchUser();
      console.log("[AuthContext] Email sign up completed successfully");
    } catch (error: any) {
      console.error("[AuthContext] Email sign up failed:", error);
      const errorMessage = error?.message || error?.error?.message || "Sign up failed";
      throw new Error(errorMessage);
    }
  };

  const signInWithSocial = async (provider: "google" | "apple" | "github") => {
    try {
      console.log(`[AuthContext] Attempting ${provider} sign in`);
      if (Platform.OS === "web") {
        const token = await openOAuthPopup(provider);
        await setBearerToken(token);
        await fetchUser();
      } else {
        // Native: Use expo-linking to generate a proper deep link
        const callbackURL = Linking.createURL("/(tabs)/(home)");
        console.log(`[AuthContext] Native ${provider} sign in with callback:`, callbackURL);
        await authClient.signIn.social({
          provider,
          callbackURL,
        });
        // Note: The redirect will reload the app or be handled by deep linking.
        // fetchUser will be called on mount or via event listener if needed.
        await fetchUser();
      }
      console.log(`[AuthContext] ${provider} sign in completed`);
    } catch (error) {
      console.error(`[AuthContext] ${provider} sign in failed:`, error);
      throw error;
    }
  };

  const signInWithGoogle = () => signInWithSocial("google");
  const signInWithApple = () => signInWithSocial("apple");
  const signInWithGitHub = () => signInWithSocial("github");

  const signOut = async () => {
    try {
      console.log("[AuthContext] Signing out...");
      await authClient.signOut();
    } catch (error) {
      console.error("[AuthContext] Sign out failed (API):", error);
    } finally {
       // Always clear local state
       console.log("[AuthContext] Clearing local auth state");
       setUser(null);
       await clearAuthTokens();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithApple,
        signInWithGitHub,
        signOut,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
