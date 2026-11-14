// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SBSSearch",
    platforms: [
        .macOS(.v13),
        .iOS(.v16)
    ],
    products: [
        .executable(name: "SBSSearch", targets: ["SBSSearch"])
    ],
    targets: [
        .executableTarget(
            name: "SBSSearch",
            path: "Sources"
        )
    ]
)
