// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Sonivo",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "Sonivo", targets: ["Sonivo"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/dotnet/signalr-client-swift",
            .upToNextMinor(from: "1.0.0")
        ),
    ],
    targets: [
        .target(
            name: "Sonivo",
            dependencies: [
                .product(name: "SignalRClient", package: "signalr-client-swift"),
            ],
            path: "Sonivo",
            exclude: ["Info.plist", "Resources"]
        ),
    ],
    swiftLanguageModes: [.v5]
)
