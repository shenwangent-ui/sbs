import SwiftUI
import WebKit

private let defaultSBSUrl = URL(
    string: "https://ais-pre-brb74sikfl77hnu7quzboq-74288553499.asia-southeast1.run.app"
)!

@main
struct SBSSearchApp: App {
    var body: some Scene {
        WindowGroup {
            SBSBrowserShellView()
                #if os(macOS)
                .frame(minWidth: 420, minHeight: 680)
                #endif
        }
        #if os(macOS)
        .defaultSize(width: 1240, height: 820)
        #endif
    }
}

final class WebViewState: ObservableObject {
    @Published var currentURL: String = defaultSBSUrl.absoluteString
    @Published var canGoBack: Bool = false
    @Published var canGoForward: Bool = false
    @Published var isLoading: Bool = true
    @Published var loadError: String? = nil

    weak var webView: WKWebView?

    func goBack() { webView?.goBack() }
    func goForward() { webView?.goForward() }
    func reload() {
        loadError = nil
        webView?.reload()
    }
    func goHome() {
        loadError = nil
        webView?.load(URLRequest(url: defaultSBSUrl))
    }
}

struct SBSBrowserShellView: View {
    @StateObject private var state = WebViewState()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button(action: state.goBack) {
                    Image(systemName: "chevron.left")
                }
                .disabled(!state.canGoBack)

                Button(action: state.goForward) {
                    Image(systemName: "chevron.right")
                }
                .disabled(!state.canGoForward)

                Button(action: state.reload) {
                    Image(systemName: state.isLoading ? "xmark" : "arrow.clockwise")
                }

                Text(state.currentURL)
                    .font(.system(size: 12, design: .monospaced))
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.gray.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Button(action: state.goHome) {
                    Image(systemName: "house")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            #if os(macOS)
            .buttonStyle(.borderless)
            #endif

            Divider()

            ZStack {
                PlatformWebView(state: state, initialURL: defaultSBSUrl)

                if let errorText = state.loadError {
                    VStack(spacing: 12) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.system(size: 36))
                            .foregroundColor(.orange)
                        Text("ไม่สามารถเชื่อมต่อ SBS Engine")
                            .font(.headline)
                        Text(errorText)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        Button("ลองเชื่อมต่อใหม่", action: state.reload)
                            .buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.background)
                }
            }
        }
    }
}

final class WebCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    let state: WebViewState

    init(state: WebViewState) {
        self.state = state
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        DispatchQueue.main.async {
            self.state.isLoading = true
            self.state.loadError = nil
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.async {
            self.state.isLoading = false
            self.state.currentURL = webView.url?.absoluteString ?? defaultSBSUrl.absoluteString
            self.state.canGoBack = webView.canGoBack
            self.state.canGoForward = webView.canGoForward
        }
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        DispatchQueue.main.async {
            self.state.isLoading = false
            self.state.loadError = error.localizedDescription
        }
    }

    // Keep target="_blank" links inside the same native app without needing external Safari
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
}

private func makeConfiguredWebView(coordinator: WebCoordinator) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    config.defaultWebpagePreferences.allowsContentJavaScript = true
    #if os(iOS)
    config.allowsInlineMediaPlayback = true
    #endif

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = coordinator
    webView.uiDelegate = coordinator
    webView.allowsBackForwardNavigationGestures = true
    return webView
}

#if os(macOS)
struct PlatformWebView: NSViewRepresentable {
    let state: WebViewState
    let initialURL: URL

    func makeCoordinator() -> WebCoordinator {
        WebCoordinator(state: state)
    }

    func makeNSView(context: Context) -> WKWebView {
        let webView = makeConfiguredWebView(coordinator: context.coordinator)
        state.webView = webView
        webView.load(URLRequest(url: initialURL))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#else
struct PlatformWebView: UIViewRepresentable {
    let state: WebViewState
    let initialURL: URL

    func makeCoordinator() -> WebCoordinator {
        WebCoordinator(state: state)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = makeConfiguredWebView(coordinator: context.coordinator)
        state.webView = webView
        webView.load(URLRequest(url: initialURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
#endif
