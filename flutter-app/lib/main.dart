import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.white,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  final port = await _startLocalAssetServer();
  runApp(SBSSearchApp(port: port));
}

Future<int> _startLocalAssetServer() async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((HttpRequest request) async {
    var path = request.uri.path;
    if (path == '/' || path.isEmpty) {
      path = '/index.html';
    }
    try {
      final data = await rootBundle.load('assets/web$path');
      request.response.headers.contentType = _getContentType(path);
      request.response.add(data.buffer.asUint8List());
    } catch (_) {
      try {
        final indexData = await rootBundle.load('assets/web/index.html');
        request.response.headers.contentType = ContentType.html;
        request.response.add(indexData.buffer.asUint8List());
      } catch (e) {
        request.response.statusCode = HttpStatus.notFound;
      }
    }
    await request.response.close();
  });
  return server.port;
}

ContentType _getContentType(String path) {
  if (path.endsWith('.html')) return ContentType.html;
  if (path.endsWith('.js') || path.endsWith('.mjs')) {
    return ContentType('application', 'javascript', charset: 'utf-8');
  }
  if (path.endsWith('.css')) return ContentType('text', 'css', charset: 'utf-8');
  if (path.endsWith('.json') || path.endsWith('.webmanifest')) {
    return ContentType.json;
  }
  if (path.endsWith('.svg')) return ContentType('image', 'svg+xml');
  if (path.endsWith('.png')) return ContentType('image', 'png');
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return ContentType('image', 'jpeg');
  if (path.endsWith('.ico')) return ContentType('image', 'x-icon');
  if (path.endsWith('.woff2')) return ContentType('font', 'woff2');
  return ContentType.binary;
}

class SBSSearchApp extends StatelessWidget {
  final int port;
  const SBSSearchApp({super.key, required this.port});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SBS Search',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF1D4ED8),
      ),
      home: WebShellScreen(port: port),
    );
  }
}

class WebShellScreen extends StatefulWidget {
  final int port;
  const WebShellScreen({super.key, required this.port});

  @override
  State<WebShellScreen> createState() => _WebShellScreenState();
}

class _WebShellScreenState extends State<WebShellScreen> {
  late final WebViewController _controller;
  bool _showSplash = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            Future.delayed(const Duration(milliseconds: 500), () {
              if (mounted) setState(() => _showSplash = false);
            });
          },
        ),
      )
      ..loadRequest(Uri.parse('http://127.0.0.1:${widget.port}/'));

    Future.delayed(const Duration(milliseconds: 2200), () {
      if (mounted && _showSplash) {
        setState(() => _showSplash = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else {
          SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              IgnorePointer(
                ignoring: !_showSplash,
                child: AnimatedOpacity(
                  opacity: _showSplash ? 1.0 : 0.0,
                  duration: const Duration(milliseconds: 350),
                  child: Container(
                    color: Colors.white,
                    width: double.infinity,
                    height: double.infinity,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Image.asset(
                          'assets/icon/logo.png',
                          width: 96,
                          height: 96,
                        ),
                        const SizedBox(height: 16),
                        RichText(
                          text: const TextSpan(
                            style: TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                            ),
                            children: [
                              TextSpan(
                                text: 'SBS ',
                                style: TextStyle(color: Color(0xFF1D4ED8)),
                              ),
                              TextSpan(
                                text: 'Search',
                                style: TextStyle(color: Color(0xFF0F172A)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
