import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// A school's build (the console's mobile build workflow) writes the Firebase file and the upload key from the console's
// connections; a developer's build has neither and runs with the debug key and without push.
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")
val signing = Properties().apply { rootProject.file("key.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) } }

android {
    namespace = "com.tangent.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // Each school's app is its own store listing: the build passes its package name (-PappId=com.tangent.greenfield).
        applicationId = (project.findProperty("appId") as String?) ?: "com.tangent.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (signing.containsKey("storeFile")) {
            create("upload") {
                storeFile = rootProject.file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
