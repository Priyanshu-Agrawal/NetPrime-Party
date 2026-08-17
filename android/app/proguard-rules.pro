# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:
# @generated begin bearoom-playback-proguard - expo prebuild (DO NOT MODIFY) sync-52102bb4f15eb6beae645567e807b59dd535f61b
-keep class com.scriptingbear.bearoom.playback.** { *; }
# @generated end bearoom-playback-proguard
