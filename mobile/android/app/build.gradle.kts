plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val configuredApiBaseUrl = providers.gradleProperty("sonivoApiBaseUrl")
    .orElse(providers.environmentVariable("SONIVO_API_BASE_URL"))
    .orElse("").get()
val configuredOidcIssuer = providers.gradleProperty("sonivoOidcIssuer")
    .orElse(providers.environmentVariable("SONIVO_OIDC_ISSUER"))
    .orElse(configuredApiBaseUrl).get()
val configuredWebBaseUrl = providers.gradleProperty("sonivoWebBaseUrl")
    .orElse(providers.environmentVariable("SONIVO_WEB_BASE_URL"))
    .orElse("").get()
val productionBuildSettings = rootProject.file("../Production.xcconfig")
    .readLines()
    .mapNotNull { line ->
        Regex("""^\s*([A-Z_]+)\s*=\s*(.*?)\s*$""").matchEntire(line)
            ?.destructured
            ?.let { (key, value) -> key to value }
    }
    .toMap()
val releaseApiBaseUrl = productionBuildSettings["API_BASE_URL"]
    ?: error("API_BASE_URL is missing from mobile/Production.xcconfig")
val releaseOidcIssuer = productionBuildSettings["OIDC_ISSUER"]
    ?: error("OIDC_ISSUER is missing from mobile/Production.xcconfig")
val releaseWebBaseUrl = productionBuildSettings["WEB_BASE_URL"]
    ?: error("WEB_BASE_URL is missing from mobile/Production.xcconfig")
require(releaseApiBaseUrl.startsWith("https://") && releaseOidcIssuer.startsWith("https://") && releaseWebBaseUrl.startsWith("https://")) {
    "Production mobile endpoints must use HTTPS"
}
require(configuredApiBaseUrl.isEmpty() || configuredApiBaseUrl.startsWith("https://")) {
    "sonivoApiBaseUrl must use HTTPS"
}
require(configuredWebBaseUrl.isEmpty() || configuredWebBaseUrl.startsWith("https://")) {
    "sonivoWebBaseUrl must use HTTPS"
}
val escapedApiBaseUrl = configuredApiBaseUrl.replace("\\", "\\\\").replace("\"", "\\\"")
val escapedOidcIssuer = configuredOidcIssuer.replace("\\", "\\\\").replace("\"", "\\\"")
val escapedWebBaseUrl = configuredWebBaseUrl.trimEnd('/').replace("\\", "\\\\").replace("\"", "\\\"")
fun buildConfigString(value: String) = "\"$value\""
android {
    namespace = "lat.sonivo.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "lat.sonivo.android"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["appAuthRedirectScheme"] = "lat.sonivo.android"
        buildConfigField("String", "API_BASE_URL", "\"$escapedApiBaseUrl\"")
        buildConfigField("String", "OIDC_ISSUER", "\"$escapedOidcIssuer\"")
        buildConfigField("String", "WEB_BASE_URL", "\"$escapedWebBaseUrl\"")
    }

    buildTypes {
        getByName("release") {
            buildConfigField("String", "API_BASE_URL", buildConfigString(releaseApiBaseUrl))
            buildConfigField("String", "OIDC_ISSUER", buildConfigString(releaseOidcIssuer))
            buildConfigField("String", "WEB_BASE_URL", buildConfigString(releaseWebBaseUrl.trimEnd('/')))
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.10.00")
    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("androidx.browser:browser:1.3.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.media3:media3-exoplayer:1.11.1")
    implementation("androidx.media3:media3-session:1.11.1")
    implementation("net.openid:appauth:0.11.1")
    implementation("com.microsoft.signalr:signalr:7.0.0")
}
