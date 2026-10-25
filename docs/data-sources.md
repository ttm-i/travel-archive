# 地図データの出典

都道府県境界には、国土交通省「国土数値情報（行政区域データ）」を都道府県単位へ統合した `open-data-jp-prefectures-geojson` を使用し、アプリ向けに簡略化しています。

- 原典: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html
- 加工元: https://github.com/piuccio/open-data-jp-prefectures-geojson
- 加工元コードのライセンス: MIT License
- アプリでの加工: Mapshaper により形状を簡略化（島を保持）

この境界は旅行記録の整理を目的としたもので、ナビゲーション、測量、各種証明には使用しません。

## Plus Codeの地域参照

地域名付きの短縮Plus Codeをオフラインで復元する基準座標には、`localgovjp` の市区町村・行政区データから、都道府県コード、市区町村名、緯度、経度だけを抽出したデータを使用しています。

- 加工元: https://github.com/code4fukui/localgovjp
- 加工元の出典: 国土地理院、地方公共団体情報システム機構
- ライセンス: CC0
- 取得日: 2026-10-25

Plus Codeの変換には、GoogleによるOpen Location Codeの公式JavaScript実装を使用しています。

- 実装: https://github.com/google/open-location-code
- ライセンス: Apache License 2.0

市区町村の基準座標は短縮コードから最寄りのフルコードを復元するためだけに使い、スポットの保存座標には復元したPlus Code領域の中心座標を使用します。
