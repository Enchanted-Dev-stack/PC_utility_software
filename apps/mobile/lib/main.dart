import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const String apiBaseUrl = String.fromEnvironment(
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
  String status = 'Idle';
  String trusted = 'untrusted';
  bool paired = false;
  String host = '-';
  String message = 'Connect to your desktop to start.';
  List<Map<String, dynamic>> previewTiles = const [];

  Uri _url(String path) => Uri.parse('$apiBaseUrl$path');

  Future<void> _discover() async {
    final response = await http.get(_url('/discover'));
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
    final response = await http.post(
      _url('/pair'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'deviceId': 'android-usb-device'}),
    );
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
  }

  Future<void> _revoke() async {
    final response = await http.post(
      _url('/revoke'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'deviceId': 'android-usb-device'}),
    );
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
    final response = await http.get(_url('/status'));
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    setState(() {
      status = (body['connection'] as String?) ?? 'unknown';
      trusted = (body['trustedIndicator'] as String?) ?? 'unknown';
      paired = (body['paired'] as bool?) ?? false;
      host = (body['activeHost'] as String?) ?? '-';
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
      message = 'Preview synced: ${tiles.length} tile(s)';
    });
  }

  Future<void> _sendAction(String actionType, {String? tileId, String? actionValue}) async {
    final response = await http.post(
      _url('/action'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'deviceId': 'android-usb-device',
        'actionType': actionType,
        if (tileId != null) 'tileId': tileId,
        if (actionValue != null) 'actionValue': actionValue,
      }),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      setState(() {
        message = 'Action failed: ${body['reason'] ?? response.body}';
      });
      return;
    }
    final lifecycle = (body['lifecycle'] as List<dynamic>? ?? []).join(' -> ');
    final resolved = body['resolved'] as Map<String, dynamic>?;
    final target = resolved != null ? (resolved['actionValue'] ?? '') : '';
    setState(() {
      message = target.toString().isNotEmpty
          ? 'Action $actionType ($target): $lifecycle'
          : 'Action $actionType: $lifecycle';
    });
    await _refreshStatus();
  }

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      setState(() {
        message = 'Request failed: $e';
      });
    }
  }

  @override
  void initState() {
    super.initState();
    _run(_refreshStatus);
    _run(_refreshPreview);
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
      final spanCols = _clampSpan(tile['spanCols'], fallback: 2).clamp(1, gridColumns);
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
            const Text(
              'Mobile Control Tiles',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            const Text(
              'These come from desktop builder preview. Tile size uses the chosen columns x rows.',
              style: TextStyle(color: Color(0xFF475569)),
            ),
            const SizedBox(height: 8),
            if (previewTiles.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text('No tiles yet', style: TextStyle(fontWeight: FontWeight.w700)),
                      SizedBox(height: 6),
                      Text('Create tiles from desktop builder, then tap "Sync Tiles" here.'),
                    ],
                  ),
                ),
              )
            else
              LayoutBuilder(
                builder: (context, constraints) {
                  const gridColumns = 4;
                  const gap = 10.0;
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

                        return Positioned(
                          left: left,
                          top: top,
                          width: width,
                          height: height,
                          child: Card(
                            elevation: 1,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(14),
                              onTap: paired
                                  ? () => _run(
                                        () => _sendAction(
                                          actionType,
                                          tileId: tileId,
                                          actionValue: actionValue,
                                        ),
                                      )
                                  : null,
                              child: Stack(
                                children: [
                                  Positioned.fill(
                                    child: Center(
                                      child: Text(
                                        iconGlyph,
                                        style: TextStyle(
                                          fontSize: height * 0.52,
                                          color: const Color(0xFF1E293B).withOpacity(0.09),
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${placement.spanCols}x${placement.spanRows}',
                                          style: const TextStyle(
                                            color: Color(0xFF64748B),
                                            fontSize: 11,
                                          ),
                                        ),
                                        const Spacer(),
                                        Text(
                                          label,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 16,
                                          ),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          actionType,
                                          style: const TextStyle(
                                            color: Color(0xFF475569),
                                            fontSize: 12,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        if (actionValue.isNotEmpty)
                                          Text(
                                            actionValue,
                                            style: const TextStyle(
                                              color: Color(0xFF64748B),
                                              fontSize: 11,
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
                        );
                      }).toList(),
                    ),
                  );
                },
              ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: paired ? () => _run(() => _sendAction('media_play_pause')) : null,
              icon: const Icon(Icons.play_arrow),
              label: const Text('Quick Action: Media Play/Pause'),
            ),
          ],
        ),
      ),
    );
  }
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
