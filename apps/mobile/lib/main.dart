import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:sensors_plus/sensors_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String defaultApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://127.0.0.1:8787',
);

void main() {
  runApp(const MobileControlApp());
}

class MobileControlApp extends StatelessWidget {
  const MobileControlApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PC Remote',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0284C7)),
        scaffoldBackgroundColor: const Color(0xFFF6F8FC),
        useMaterial3: true,
        textTheme: GoogleFonts.spaceGroteskTextTheme(),
      ),
      home: const ControlScreen(),
    );
  }
}

class ControlScreen extends StatefulWidget {
  const ControlScreen({super.key});

  @override
  State<ControlScreen> createState() => _ControlScreenState();
}

class _ControlScreenState extends State<ControlScreen> {
  String baseUrl = defaultApiBaseUrl;
  String status = 'Idle';
  String trusted = 'untrusted';
  bool paired = false;
  String host = '-';
  String message = 'Connect to your desktop to start.';
  List<Map<String, dynamic>> previewTiles = const [];
  final TextEditingController serverController =
      TextEditingController(text: defaultApiBaseUrl);

  Uri _url(String path) => Uri.parse('$baseUrl$path');

  String _normalizeBaseUrl(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) {
      return defaultApiBaseUrl;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return 'http://$trimmed';
  }

  Future<void> _loadServerUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('server_base_url');
    final next = _normalizeBaseUrl(saved ?? defaultApiBaseUrl);
    setState(() {
      baseUrl = next;
      serverController.text = next;
    });
  }

  Future<void> _saveServerUrl() async {
    final next = _normalizeBaseUrl(serverController.text);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_base_url', next);
    setState(() {
      baseUrl = next;
      serverController.text = next;
      message = 'Server URL updated: $next';
    });
    await _refreshStatus();
    await _refreshPreview();
  }

  bool _isPrivateIpv4(String ip) {
    final parts = ip.split('.');
    if (parts.length != 4) {
      return false;
    }

    final octets = parts.map(int.tryParse).toList();
    if (octets.any((value) => value == null)) {
      return false;
    }

    final a = octets[0]!;
    final b = octets[1]!;
    if (a == 10) {
      return true;
    }
    if (a == 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a == 192 && b == 168) {
      return true;
    }
    return false;
  }

  Future<bool> _isServerReachable(String candidateBaseUrl) async {
    try {
      final response = await http
          .get(Uri.parse('$candidateBaseUrl/health'))
          .timeout(const Duration(milliseconds: 450));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<String?> _discoverServerUrlOnLan() async {
    List<NetworkInterface> interfaces;
    try {
      interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
        includeLinkLocal: false,
      );
    } on SocketException {
      return null;
    } catch (_) {
      return null;
    }

    final localIps = <String>{};
    final prefixes = <String>{};

    for (final iface in interfaces) {
      for (final address in iface.addresses) {
        final ip = address.address;
        if (!_isPrivateIpv4(ip)) {
          continue;
        }
        localIps.add(ip);
        final parts = ip.split('.');
        prefixes.add('${parts[0]}.${parts[1]}.${parts[2]}');
      }
    }

    for (final prefix in prefixes) {
      for (var chunkStart = 1; chunkStart <= 254; chunkStart += 20) {
        final chunkEnd = min(chunkStart + 19, 254);
        final batch = <Future<String?>>[];

        for (var host = chunkStart; host <= chunkEnd; host++) {
          final ip = '$prefix.$host';
          if (localIps.contains(ip)) {
            continue;
          }

          final candidate = 'http://$ip:8787';
          batch.add(() async {
            final ok = await _isServerReachable(candidate);
            return ok ? candidate : null;
          }());
        }

        final results = await Future.wait(batch);
        for (final value in results) {
          if (value != null) {
            return value;
          }
        }
      }
    }

    return null;
  }

  Future<void> _ensureServerReachable() async {
    if (await _isServerReachable(baseUrl)) {
      return;
    }

    final discovered = await _discoverServerUrlOnLan();
    if (discovered == null) {
      throw Exception('Connection refused at $baseUrl. Set or auto-find your desktop URL.');
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_base_url', discovered);
    setState(() {
      baseUrl = discovered;
      serverController.text = discovered;
      message = 'Auto-found desktop: $discovered';
    });
  }

  Future<void> _autoFindServer() async {
    final discovered = await _discoverServerUrlOnLan();
    if (discovered == null) {
      setState(() {
        message = 'No desktop runtime found on local network.';
      });
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_base_url', discovered);
    setState(() {
      baseUrl = discovered;
      serverController.text = discovered;
      message = 'Auto-found desktop: $discovered';
    });
    await _refreshStatus();
    await _refreshPreview();
  }

  Future<http.Response> _safeGet(String path) async {
    await _ensureServerReachable();
    return http.get(_url(path)).timeout(const Duration(seconds: 3));
  }

  Future<http.Response> _safePost(String path, Map<String, dynamic> body) async {
    await _ensureServerReachable();
    return http
        .post(
          _url(path),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 3));
  }

  Future<void> _discover() async {
    final response = await _safeGet('/discover');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final hosts = (body['hosts'] as List<dynamic>?) ?? [];
    setState(() {
      message = hosts.isNotEmpty
          ? 'Discovered ${hosts.length} host(s).'
          : 'No hosts found.';
    });
    await _refreshStatus();
  }

  Future<void> _pair() async {
    final response = await _safePost('/pair', {'deviceId': 'android-usb-device'});
    if (response.statusCode >= 400) {
      setState(() {
        message = 'Pair failed: ${response.body}';
      });
      return;
    }
    setState(() {
      message = 'Pairing approved on server.';
    });
    await _refreshStatus();
    await _refreshPreview();
  }

  Future<void> _revoke() async {
    final response = await _safePost('/revoke', {'deviceId': 'android-usb-device'});
    if (response.statusCode >= 400) {
      setState(() {
        message = 'Revoke rejected: ${response.body}';
      });
      return;
    }
    setState(() {
      message = 'Device revoked.';
    });
    await _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    final response = await _safeGet('/status');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    setState(() {
      status = (body['connection'] as String?) ?? 'unknown';
      trusted = (body['trustedIndicator'] as String?) ?? 'unknown';
      paired = (body['paired'] as bool?) ?? false;
      host = (body['activeHost'] as String?) ?? '-';
    });
  }

  Future<void> _refreshPreview() async {
    final response = await _safeGet('/preview');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final tiles = (body['tiles'] as List<dynamic>? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    setState(() {
      previewTiles = tiles;
      message = 'Preview synced: ${tiles.length} tile(s)';
    });
  }

  Future<void> _openCustomScreen() async {
    await _run(_refreshPreview);
    if (!mounted) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => TileScreen(
          baseUrl: baseUrl,
          initiallyPaired: paired,
          initialTiles: previewTiles,
        ),
      ),
    );

    await _run(_refreshStatus);
    await _run(_refreshPreview);
  }

  Future<void> _openPresetScreen() async {
    await _run(_refreshStatus);
    if (!mounted) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PresetControlScreen(
          baseUrl: baseUrl,
          initiallyPaired: paired,
        ),
      ),
    );

    await _run(_refreshStatus);
  }

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      final text = e.toString();
      final friendly = text.contains('Connection refused')
          ? 'Connection refused. Use Save URL or Auto Find to point to your desktop.'
          : 'Request failed: $e';
      setState(() {
        message = friendly;
      });
    }
  }

  @override
  void initState() {
    super.initState();
    _run(() async {
      await _loadServerUrl();
      await _refreshStatus();
      await _refreshPreview();
    });
  }

  @override
  void dispose() {
    serverController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final connected = status == 'connected';
    final statusColor = connected ? const Color(0xFF15803D) : const Color(0xFFB45309);

    return Scaffold(
      appBar: AppBar(
        title: const Text('PC Remote'),
        actions: [
          IconButton(
            onPressed: () => _run(_refreshStatus),
            icon: const Icon(Icons.sync),
            tooltip: 'Refresh status',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _run(_refreshStatus);
          await _run(_refreshPreview);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF0EA5E9), Color(0xFF1D4ED8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Desktop Connection',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    connected ? 'Connected' : 'Not Connected',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Host: $host  |  Trust: $trusted',
                    style: const TextStyle(color: Colors.white),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Desktop Server URL',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Set your PC LAN URL once (example: http://192.168.1.23:8787).',
                      style: TextStyle(color: Color(0xFF475569)),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: serverController,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        isDense: true,
                        hintText: 'http://192.168.1.23:8787',
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.icon(
                          onPressed: () => _run(_saveServerUrl),
                          icon: const Icon(Icons.save),
                          label: const Text('Save URL'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => _run(_refreshStatus),
                          icon: const Icon(Icons.network_check),
                          label: const Text('Test'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => _run(_autoFindServer),
                          icon: const Icon(Icons.search),
                          label: const Text('Auto Find'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed: () => _run(_discover),
                      icon: const Icon(Icons.wifi_tethering),
                      label: const Text('Discover'),
                    ),
                    FilledButton.icon(
                      onPressed: () => _run(_pair),
                      icon: const Icon(Icons.link),
                      label: const Text('Pair'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _run(_revoke),
                      icon: const Icon(Icons.link_off),
                      label: const Text('Revoke'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _run(_refreshPreview),
                      icon: const Icon(Icons.phone_android),
                      label: const Text('Sync Tiles'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    message,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Tile Controls',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Open either your customizable grid or predefined utility controls. Synced tiles: ${previewTiles.length}.',
                      style: const TextStyle(color: Color(0xFF475569)),
                    ),
                    const SizedBox(height: 10),
                    FilledButton.icon(
                      onPressed: () => _run(_openCustomScreen),
                      icon: const Icon(Icons.dashboard_customize),
                      label: const Text('Custom Controls'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => _run(_openPresetScreen),
                      icon: const Icon(Icons.tune),
                      label: const Text('Quick Controls'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class TileScreen extends StatefulWidget {
  const TileScreen({
    super.key,
    required this.baseUrl,
    required this.initiallyPaired,
    required this.initialTiles,
  });

  final String baseUrl;
  final bool initiallyPaired;
  final List<Map<String, dynamic>> initialTiles;

  @override
  State<TileScreen> createState() => _TileScreenState();
}

class _TileScreenState extends State<TileScreen> {
  static const String _themePrefKey = 'tile_theme_preset';
  static const double _shakeThresholdG = 2.0;
  static const Duration _shakeCooldown = Duration(milliseconds: 1200);

  bool paired = false;
  List<Map<String, dynamic>> previewTiles = const [];
  String themeId = 'neo_brutal';
  StreamSubscription<AccelerometerEvent>? _shakeSubscription;
  DateTime? _lastShakeAt;

  Uri _url(String path) => Uri.parse('${widget.baseUrl}$path');

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_themePrefKey);
    if (saved == null || _themes.every((theme) => theme.id != saved)) {
      return;
    }
    setState(() {
      themeId = saved;
    });
  }

  Future<void> _setTheme(String nextThemeId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themePrefKey, nextThemeId);
    setState(() {
      themeId = nextThemeId;
    });
    _notify('Theme: ${_themeById(nextThemeId).name}');
  }

  void _startShakeDetection() {
    _shakeSubscription = accelerometerEventStream().listen((event) {
      final gForce = sqrt((event.x * event.x) + (event.y * event.y) + (event.z * event.z)) /
          9.80665;
      if (gForce < _shakeThresholdG) {
        return;
      }

      final now = DateTime.now();
      if (_lastShakeAt != null && now.difference(_lastShakeAt!) < _shakeCooldown) {
        return;
      }
      _lastShakeAt = now;
      _openQuickControls();
    });
  }

  void _notify(String value) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(content: Text(value)));
  }

  Future<void> _refreshStatus() async {
    final response = await http.get(_url('/status'));
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    setState(() {
      paired = (body['paired'] as bool?) ?? false;
    });
  }

  Future<void> _refreshPreview() async {
    final response = await http.get(_url('/preview'));
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final tiles = (body['tiles'] as List<dynamic>? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    setState(() {
      previewTiles = tiles;
    });
  }

  Future<void> _sendAction(String actionType, {String? tileId, String? actionValue}) async {
    final payload = <String, dynamic>{
      'deviceId': 'android-usb-device',
      'actionType': actionType,
      'tileId': tileId,
      'actionValue': actionValue,
    };
    payload.removeWhere((_, value) => value == null);

    final response = await http.post(
      _url('/action'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      _notify('Action failed: ${body['reason'] ?? response.body}');
      return;
    }

    final lifecycle = (body['lifecycle'] as List<dynamic>? ?? []).join(' -> ');
    final resolved = body['resolved'] as Map<String, dynamic>?;
    final target = resolved != null ? (resolved['actionValue'] ?? '') : '';
    _notify(
      target.toString().isNotEmpty
          ? 'Action $actionType ($target): $lifecycle'
          : 'Action $actionType: $lifecycle',
    );
    await _refreshStatus();
  }

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      _notify('Request failed: $e');
    }
  }

  Future<void> _openQuickControls() async {
    if (!mounted) {
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final activeTheme = _themeById(themeId);
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Quick Controls',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Paired: ${paired ? 'yes' : 'no'} | Tiles: ${previewTiles.length}',
                    style: const TextStyle(color: Color(0xFF475569)),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: () => _run(_refreshPreview),
                        icon: const Icon(Icons.sync),
                        label: const Text('Sync Tiles'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => _run(_refreshStatus),
                        icon: const Icon(Icons.wifi_tethering),
                        label: const Text('Refresh Status'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.of(sheetContext).pop();
                          Navigator.of(context).maybePop();
                        },
                        icon: const Icon(Icons.home),
                        label: const Text('Back to Home'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Tile Theme (${activeTheme.name})',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _themes.map((theme) {
                      return ChoiceChip(
                        label: Text(theme.name),
                        selected: theme.id == themeId,
                        onSelected: (_) async {
                          await _setTheme(theme.id);
                          setSheetState(() {});
                        },
                      );
                    }).toList(),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  int _clampSpan(dynamic value, {required int fallback}) {
    final parsed = int.tryParse('$value');
    if (parsed == null) {
      return fallback;
    }
    if (parsed < 1) {
      return 1;
    }
    if (parsed > 4) {
      return 4;
    }
    return parsed;
  }

  String _iconGlyph(Map<String, dynamic> tile) {
    final raw = '${tile['icon'] ?? ''}'.trim();
    if (raw.isEmpty) {
      return '⭐';
    }

    const map = <String, String>{
      'language': '🌐',
      'music_note': '🎵',
      'apps': '🧩',
      'link': '🔗',
      'note': '📝',
      'bolt': '⚡',
    };

    final mapped = map[raw.toLowerCase()];
    return mapped ?? raw;
  }

  List<_PlacedTile> _buildPlacements(List<Map<String, dynamic>> tiles, {int gridColumns = 4}) {
    final occupancy = <List<bool>>[];
    final placements = <_PlacedTile>[];

    void ensureRows(int minRows) {
      while (occupancy.length < minRows) {
        occupancy.add(List<bool>.filled(gridColumns, false));
      }
    }

    bool canPlace(int row, int col, int spanCols, int spanRows) {
      ensureRows(row + spanRows);
      for (var r = row; r < row + spanRows; r++) {
        for (var c = col; c < col + spanCols; c++) {
          if (occupancy[r][c]) {
            return false;
          }
        }
      }
      return true;
    }

    void occupy(int row, int col, int spanCols, int spanRows) {
      ensureRows(row + spanRows);
      for (var r = row; r < row + spanRows; r++) {
        for (var c = col; c < col + spanCols; c++) {
          occupancy[r][c] = true;
        }
      }
    }

    for (final tile in tiles) {
      final spanCols = _clampSpan(tile['spanCols'], fallback: 2) > gridColumns
          ? gridColumns
          : _clampSpan(tile['spanCols'], fallback: 2);
      final spanRows = _clampSpan(tile['spanRows'], fallback: 1);
      var row = 0;
      var placed = false;

      while (!placed) {
        ensureRows(row + spanRows);
        for (var col = 0; col <= gridColumns - spanCols; col++) {
          if (!canPlace(row, col, spanCols, spanRows)) {
            continue;
          }

          occupy(row, col, spanCols, spanRows);
          placements.add(
            _PlacedTile(
              tile: tile,
              row: row,
              col: col,
              spanCols: spanCols,
              spanRows: spanRows,
            ),
          );
          placed = true;
          break;
        }

        if (!placed) {
          row += 1;
        }
      }
    }

    return placements;
  }

  @override
  void initState() {
    super.initState();
    paired = widget.initiallyPaired;
    previewTiles = widget.initialTiles;
    _run(() async {
      await _loadTheme();
      await _refreshStatus();
      await _refreshPreview();
    });
    _startShakeDetection();
  }

  @override
  void dispose() {
    _shakeSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeTheme = _themeById(themeId);
    final statusBarStyle = SystemUiOverlayStyle(
      statusBarColor: activeTheme.statusBarColor,
      statusBarIconBrightness:
          activeTheme.darkStatusIcons ? Brightness.dark : Brightness.light,
      statusBarBrightness:
          activeTheme.darkStatusIcons ? Brightness.light : Brightness.dark,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: statusBarStyle,
      child: Scaffold(
        backgroundColor: activeTheme.screenBackground,
        body: SafeArea(
          child: GestureDetector(
            onLongPress: _openQuickControls,
            child: RefreshIndicator(
              onRefresh: () async {
                await _run(_refreshStatus);
                await _run(_refreshPreview);
              },
              child: ListView(
                padding: EdgeInsets.all(activeTheme.screenPadding),
                children: [
                  if (previewTiles.isEmpty)
                    SizedBox(
                      height: MediaQuery.of(context).size.height * 0.72,
                      child: Center(
                        child: Text(
                          paired
                              ? 'No tiles available yet'
                              : 'Pair from home screen first',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF334155),
                          ),
                        ),
                      ),
                    )
                  else
                    LayoutBuilder(
                      builder: (context, constraints) {
                        const gridColumns = 4;
                        final gap = activeTheme.gridGap;
                        const rowHeight = 96.0;
                        final placements = _buildPlacements(previewTiles, gridColumns: gridColumns);

                        var totalRows = 1;
                        for (final placement in placements) {
                          final endRow = placement.row + placement.spanRows;
                          if (endRow > totalRows) {
                            totalRows = endRow;
                          }
                        }

                        final cellWidth =
                            (constraints.maxWidth - ((gridColumns - 1) * gap)) / gridColumns;
                        final totalHeight = (totalRows * rowHeight) + ((totalRows - 1) * gap);

                        return SizedBox(
                          height: totalHeight,
                          child: Stack(
                            children: placements.map((placement) {
                              final tile = placement.tile;
                              final label = '${tile['label'] ?? 'Tile'}';
                              final actionType = '${tile['actionType'] ?? 'open_url'}';
                              final actionValue = '${tile['actionValue'] ?? ''}';
                              final tileId = '${tile['id'] ?? ''}';
                              final iconGlyph = _iconGlyph(tile);
                              final width =
                                  (placement.spanCols * cellWidth) + ((placement.spanCols - 1) * gap);
                              final height =
                                  (placement.spanRows * rowHeight) + ((placement.spanRows - 1) * gap);
                              final left = placement.col * (cellWidth + gap);
                              final top = placement.row * (rowHeight + gap);
                              final compactTile = height < 120;

                              return Positioned(
                                left: left,
                                top: top,
                                width: width,
                                height: height,
                                child: Material(
                                  color: Colors.transparent,
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(activeTheme.radius),
                                    onTap: paired
                                        ? () => _run(
                                              () => _sendAction(
                                                actionType,
                                                tileId: tileId,
                                                actionValue: actionValue,
                                              ),
                                            )
                                        : null,
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: activeTheme.background,
                                        borderRadius: BorderRadius.circular(activeTheme.radius),
                                        border: Border.all(
                                          color: activeTheme.border,
                                          width: activeTheme.borderWidth,
                                        ),
                                        boxShadow: activeTheme.shadows,
                                      ),
                                      child: Stack(
                                        children: [
                                          Positioned.fill(
                                            child: Center(
                                              child: Text(
                                                iconGlyph,
                                                style: TextStyle(
                                                  fontSize: height * 0.52,
                                                  color: activeTheme.iconTint,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                            ),
                                          ),
                                          Padding(
                                            padding: EdgeInsets.all(compactTile ? 8 : 12),
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  '${placement.spanCols}x${placement.spanRows}',
                                                  style: TextStyle(
                                                    color: activeTheme.meta,
                                                    fontSize: compactTile ? 10 : 11,
                                                    fontWeight: FontWeight.w600,
                                                  ),
                                                ),
                                                const Spacer(),
                                                Text(
                                                  label,
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    fontSize: compactTile ? 14 : 16,
                                                    color: activeTheme.text,
                                                  ),
                                                  maxLines: compactTile ? 1 : 2,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                                if (!compactTile) const SizedBox(height: 4),
                                                if (!compactTile)
                                                  Text(
                                                    actionType,
                                                    style: TextStyle(
                                                      color: activeTheme.meta,
                                                      fontSize: 12,
                                                    ),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class PresetControlScreen extends StatefulWidget {
  const PresetControlScreen({
    super.key,
    required this.baseUrl,
    required this.initiallyPaired,
  });

  final String baseUrl;
  final bool initiallyPaired;

  @override
  State<PresetControlScreen> createState() => _PresetControlScreenState();
}

class _PresetControlScreenState extends State<PresetControlScreen> {
  bool paired = false;
  String statusLine = 'Ready';

  Uri _url(String path) => Uri.parse('${widget.baseUrl}$path');

  Future<void> _refreshStatus() async {
    final response = await http.get(_url('/status'));
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    setState(() {
      paired = (body['paired'] as bool?) ?? false;
      statusLine = paired ? 'Connected: ${body['activeHost'] ?? 'desktop'}' : 'Not paired';
    });
  }

  Future<void> _executeAction({
    required String actionType,
    String? actionValue,
    required bool destructive,
    required String label,
  }) async {
    if (destructive) {
      final approved = await showDialog<bool>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: Text('Confirm $label'),
            content: Text('Are you sure you want to run "$label" on your PC?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Run'),
              ),
            ],
          );
        },
      );

      if (approved != true) {
        return;
      }
    }

    final payload = <String, dynamic>{
      'deviceId': 'android-usb-device',
      'actionType': actionType,
    };
    if (actionValue != null && actionValue.isNotEmpty) {
      payload['actionValue'] = actionValue;
    }

    final response = await http.post(
      _url('/action'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      setState(() {
        statusLine = 'Failed: ${body['reason'] ?? response.body}';
      });
      return;
    }

    setState(() {
      statusLine = '$label executed';
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      setState(() {
        statusLine = 'Request failed: $e';
      });
    }
  }

  @override
  void initState() {
    super.initState();
    paired = widget.initiallyPaired;
    _run(_refreshStatus);
  }

  Widget _labelMono(String text, {Color color = const Color(0xFF64748B)}) {
    return Text(
      text,
      style: GoogleFonts.notoSansMono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.3,
        color: color,
      ),
    );
  }

  Widget _powerTile({
    required String id,
    required String title,
    required String subtitle,
    required IconData icon,
    required Color accent,
    required bool destructive,
    String? actionValue,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: paired
            ? () => _run(
                  () => _executeAction(
                    actionType: id,
                    actionValue: actionValue,
                    destructive: destructive,
                    label: title,
                  ),
                )
            : null,
        child: Container(
          height: 150,
          decoration: BoxDecoration(
            color: const Color(0xFF000000),
            border: Border.all(color: const Color(0xFF1A1A1A), width: 1),
          ),
          padding: const EdgeInsets.all(16),
          child: Stack(
            children: [
              Positioned(
                right: -12,
                bottom: -12,
                child: Icon(icon, size: 86, color: accent.withValues(alpha: 0.12)),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Icon(icon, color: accent, size: 20),
                  ),
                  const Spacer(),
                  Text(
                    title,
                    style: GoogleFonts.spaceGrotesk(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.spaceGrotesk(
                      color: const Color(0xFF64748B),
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _smallActionTile({
    required String id,
    required String title,
    required IconData icon,
    required Color accent,
    bool destructive = false,
    String? actionValue,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: paired
            ? () => _run(
                  () => _executeAction(
                    actionType: id,
                    actionValue: actionValue,
                    destructive: destructive,
                    label: title,
                  ),
                )
            : null,
        child: Container(
          height: 120,
          decoration: BoxDecoration(
            color: const Color(0xFF000000),
            border: Border.all(color: const Color(0xFF1A1A1A), width: 1),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: accent, size: 30),
              const SizedBox(height: 8),
              Text(
                title,
                style: GoogleFonts.spaceGrotesk(
                  color: const Color(0xFFE2E8F0),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _shortcutTile({
    required String id,
    required String title,
    required IconData icon,
    required Color accent,
    String? actionValue,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: paired
            ? () => _run(
                  () => _executeAction(
                    actionType: id,
                    actionValue: actionValue,
                    destructive: false,
                    label: title,
                  ),
                )
            : null,
        child: Container(
          height: 76,
          decoration: BoxDecoration(
            color: const Color(0xFF000000),
            border: Border.all(color: const Color(0xFF1A1A1A), width: 1),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0xFF101010),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(icon, color: accent, size: 18),
              ),
              const SizedBox(width: 10),
              Text(
                title,
                style: GoogleFonts.spaceGrotesk(
                  color: const Color(0xFFE2E8F0),
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Color(0xFF000000),
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: const Color(0xFF000000),
        body: SafeArea(
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 14),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Color(0xFF1A1A1A))),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Control Center',
                            style: GoogleFonts.spaceGrotesk(
                              color: Colors.white,
                              fontSize: 26,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Container(
                                width: 7,
                                height: 7,
                                decoration: BoxDecoration(
                                  color: paired ? const Color(0xFFC6FF00) : const Color(0xFF475569),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              const SizedBox(width: 8),
                              _labelMono(
                                statusLine.toUpperCase(),
                                color: const Color(0xFF94A3B8),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close, color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () => _run(_refreshStatus),
                  child: ListView(
                    padding: EdgeInsets.zero,
                    children: [
                      Row(
                        children: [
                          _powerTile(
                            id: 'system_sleep',
                            title: 'Sleep',
                            subtitle: 'Low power mode',
                            icon: Icons.bedtime,
                            accent: const Color(0xFFD500F9),
                            destructive: true,
                          ),
                          _powerTile(
                            id: 'system_shutdown',
                            title: 'Shut Down',
                            subtitle: 'Turn off PC',
                            icon: Icons.power_settings_new,
                            accent: const Color(0xFFFF3D00),
                            destructive: true,
                          ),
                        ],
                      ),
                      Row(
                        children: [
                          _smallActionTile(
                            id: 'system_restart',
                            title: 'Restart',
                            icon: Icons.restart_alt,
                            accent: const Color(0xFF00E5FF),
                            destructive: true,
                          ),
                          _smallActionTile(
                            id: 'system_lock',
                            title: 'Lock',
                            icon: Icons.lock,
                            accent: const Color(0xFFC6FF00),
                          ),
                          _smallActionTile(
                            id: 'open_task_manager',
                            title: 'Task Mgr',
                            icon: Icons.monitor_heart,
                            accent: const Color(0xFF2979FF),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: const BoxDecoration(
                          border: Border(
                            top: BorderSide(color: Color(0xFF1A1A1A)),
                            bottom: BorderSide(color: Color(0xFF1A1A1A)),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _labelMono('MEDIA CONTROL', color: const Color(0xFF64748B)),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                _smallActionTile(
                                  id: 'volume_down',
                                  title: 'Vol -',
                                  icon: Icons.volume_down,
                                  accent: const Color(0xFF38BDF8),
                                ),
                                _smallActionTile(
                                  id: 'volume_mute',
                                  title: 'Mute',
                                  icon: Icons.volume_off,
                                  accent: const Color(0xFF94A3B8),
                                ),
                                _smallActionTile(
                                  id: 'volume_up',
                                  title: 'Vol +',
                                  icon: Icons.volume_up,
                                  accent: const Color(0xFF38BDF8),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                _smallActionTile(
                                  id: 'media_previous',
                                  title: 'Prev',
                                  icon: Icons.skip_previous,
                                  accent: const Color(0xFFCBD5E1),
                                ),
                                _smallActionTile(
                                  id: 'media_play_pause',
                                  title: 'Play',
                                  icon: Icons.play_arrow,
                                  accent: const Color(0xFFE2E8F0),
                                ),
                                _smallActionTile(
                                  id: 'media_next',
                                  title: 'Next',
                                  icon: Icons.skip_next,
                                  accent: const Color(0xFFCBD5E1),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      Row(
                        children: [
                          _shortcutTile(
                            id: 'open_app',
                            actionValue: 'explorer.exe',
                            title: 'Files',
                            icon: Icons.folder_open,
                            accent: const Color(0xFFC6FF00),
                          ),
                          _shortcutTile(
                            id: 'open_url',
                            actionValue: 'https://google.com',
                            title: 'Browser',
                            icon: Icons.public,
                            accent: const Color(0xFF00E5FF),
                          ),
                        ],
                      ),
                      Row(
                        children: [
                          _shortcutTile(
                            id: 'open_app',
                            actionValue: 'cmd.exe',
                            title: 'Terminal',
                            icon: Icons.terminal,
                            accent: const Color(0xFFD500F9),
                          ),
                          _shortcutTile(
                            id: 'open_app',
                            actionValue: 'calc.exe',
                            title: 'Calc',
                            icon: Icons.calculate,
                            accent: const Color(0xFFFF3D00),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                    ],
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

class _TileVisualTheme {
  const _TileVisualTheme({
    required this.id,
    required this.name,
    required this.background,
    required this.border,
    required this.text,
    required this.meta,
    required this.iconTint,
    required this.radius,
    required this.borderWidth,
    required this.shadows,
    required this.gridGap,
    required this.screenPadding,
    required this.screenBackground,
    required this.statusBarColor,
    required this.darkStatusIcons,
  });

  final String id;
  final String name;
  final Color background;
  final Color border;
  final Color text;
  final Color meta;
  final Color iconTint;
  final double radius;
  final double borderWidth;
  final List<BoxShadow> shadows;
  final double gridGap;
  final double screenPadding;
  final Color screenBackground;
  final Color statusBarColor;
  final bool darkStatusIcons;
}

const List<_TileVisualTheme> _themes = [
  _TileVisualTheme(
    id: 'neo_brutal',
    name: 'Neo Brutalist Grid V1',
    background: Color(0xFFFFF27D),
    border: Color(0xFF111827),
    text: Color(0xFF0F172A),
    meta: Color(0xFF334155),
    iconTint: Color(0x33111827),
    radius: 4,
    borderWidth: 3,
    shadows: [
      BoxShadow(
        color: Color(0xFF0F172A),
        offset: Offset(4, 4),
        blurRadius: 0,
      ),
    ],
    gridGap: 10,
    screenPadding: 10,
    screenBackground: Color(0xFFF6F8FC),
    statusBarColor: Color(0xFFF6F8FC),
    darkStatusIcons: true,
  ),
  _TileVisualTheme(
    id: 'premium_glow',
    name: 'Premium Glow Grid V2',
    background: Color(0xFF000000),
    border: Color(0xFF1A1A1A),
    text: Color(0xFFFFFFFF),
    meta: Color(0xFF6B7280),
    iconTint: Color(0x1400E5FF),
    radius: 10,
    borderWidth: 1,
    shadows: [
      BoxShadow(
        color: Color(0x2200E5FF),
        offset: Offset(0, 0),
        blurRadius: 10,
      ),
    ],
    gridGap: 0,
    screenPadding: 0,
    screenBackground: Color(0xFF000000),
    statusBarColor: Color(0xFF000000),
    darkStatusIcons: false,
  ),
  _TileVisualTheme(
    id: 'amoled_control_center',
    name: 'AMOLED Control Center',
    background: Color(0xFF000000),
    border: Color(0xFF1A1A1A),
    text: Color(0xFFE2E8F0),
    meta: Color(0xFF64748B),
    iconTint: Color(0x1400E5FF),
    radius: 0,
    borderWidth: 1,
    shadows: [],
    gridGap: 10,
    screenPadding: 10,
    screenBackground: Color(0xFF000000),
    statusBarColor: Color(0xFF000000),
    darkStatusIcons: false,
  ),
  _TileVisualTheme(
    id: 'midnight',
    name: 'Midnight',
    background: Color(0xFF0F172A),
    border: Color(0xFF334155),
    text: Color(0xFFE2E8F0),
    meta: Color(0xFF94A3B8),
    iconTint: Color(0x1AE2E8F0),
    radius: 14,
    borderWidth: 1.6,
    shadows: [
      BoxShadow(
        color: Color(0x330F172A),
        offset: Offset(0, 8),
        blurRadius: 20,
      ),
    ],
    gridGap: 10,
    screenPadding: 10,
    screenBackground: Color(0xFF0B1020),
    statusBarColor: Color(0xFF0B1020),
    darkStatusIcons: false,
  ),
  _TileVisualTheme(
    id: 'divider_grid',
    name: 'Divider Grid',
    background: Color(0xFFF8FAFC),
    border: Color(0xFF94A3B8),
    text: Color(0xFF0F172A),
    meta: Color(0xFF475569),
    iconTint: Color(0x0F0F172A),
    radius: 0,
    borderWidth: 0.9,
    shadows: [],
    gridGap: 0,
    screenPadding: 0,
    screenBackground: Color(0xFFF8FAFC),
    statusBarColor: Color(0xFFF8FAFC),
    darkStatusIcons: true,
  ),
];

_TileVisualTheme _themeById(String id) {
  return _themes.firstWhere(
    (theme) => theme.id == id,
    orElse: () => _themes.first,
  );
}

class _PlacedTile {
  const _PlacedTile({
    required this.tile,
    required this.row,
    required this.col,
    required this.spanCols,
    required this.spanRows,
  });

  final Map<String, dynamic> tile;
  final int row;
  final int col;
  final int spanCols;
  final int spanRows;
}
