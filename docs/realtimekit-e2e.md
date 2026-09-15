# RealtimeKit E2E

この手順は、Aster Serverが発行したParticipant Tokenを使い、2つのAster Client間で音声、カメラ、画面共有が実際に届くことを確認します。Cloudflare API TokenはServerだけに設定し、Clientやブラウザへ渡しません。

## 事前準備

Cloudflare Dashboardで検証専用のRealtimeKit Appを作成します。本番用Appとは分けてください。ServerがMeetingとParticipantを作成・削除するため、API Tokenには対象AccountのRealtime権限が必要です。

Appには次の3つのPresetを用意します。名前を変更する場合は、対応するServer環境変数も同じ名前にします。

| Preset | Aster Permission | 必要なMedia権限 |
| --- | --- | --- |
| `group_call_listener` | `CONNECT` | 参加と受信のみ |
| `group_call_participant` | `CONNECT`、`SPEAK` | Microphone送信とCamera送信 |
| `group_call_host` | `CONNECT`、`SPEAK`、`STREAM` | Microphone、Camera、Screen Share送信 |

Serverへ次を設定します。値はSecret Managerまたはローカルの未追跡環境ファイルへ保存します。

```dotenv
ASTER_VOICE_PROVIDER=cloudflare-realtimekit
ASTER_CLOUDFLARE_ACCOUNT_ID=<account-id>
ASTER_CLOUDFLARE_REALTIME_APP_ID=<app-id>
ASTER_CLOUDFLARE_API_TOKEN=<server-only-api-token>
ASTER_CLOUDFLARE_REALTIME_LISTENER_PRESET=group_call_listener
ASTER_CLOUDFLARE_REALTIME_VOICE_PRESET=group_call_participant
ASTER_CLOUDFLARE_REALTIME_STREAM_PRESET=group_call_host
```

検証用の2ユーザーを同じGuildへ参加させ、同じVoice Channelへの`CONNECT`を許可します。送信側には`SPEAK`と`STREAM`も許可します。

## 2クライアント確認

1. Asterデスクトップアプリで送信側ユーザーへログインします。
2. 別ブラウザプロファイルまたは別端末で受信側ユーザーへログインします。
3. 両方で同じVoice Channelへ参加し、参加人数と`VOICE_STATE_UPDATE`が双方で一致することを確認します。
4. 送信側のMuteを解除し、受信側で音声が聞こえることを確認します。音響ループを避けるため、少なくとも一方はヘッドホンを使います。
5. 送信側のCameraを有効にし、送信側のPreviewと受信側のCamera Surfaceを確認します。
6. 送信側でScreen Shareを開始し、共有対象を選びます。受信側でScreen SurfaceがCameraより大きく表示されることを確認します。
7. CameraとScreen Shareを停止し、受信側のSurfaceが消えることを確認します。
8. 送信側を退出させ、両方の参加人数、Voice State、Media Trackが解放されることを確認します。

## macOS権限

初回のMute解除とCamera開始では、macOSのMicrophone／Camera許可が表示されます。Screen Shareでは「システム設定 > プライバシーとセキュリティ > 画面収録とシステムオーディオ」でAsterを許可します。拒否後に設定を変更した場合はAsterを終了して再起動します。

## 失敗時の確認

- `403`で参加できない場合は、Asterの`CONNECT` PermissionとRealtimeKit Preset名を確認します。
- Mute解除やCamera開始だけ失敗する場合は、Presetの送信権限とOS権限を確認します。
- Screen Shareだけ失敗する場合は、Asterの`STREAM` Permission、PresetのScreen Share権限、macOSの画面収録許可を確認します。
- Participantは見えるがMediaが届かない場合は、ネットワークのWebRTC通信とCloudflareのRealtimeKit Session状態を確認します。
- TokenやAccount IDは画面、ログ、Issueへ貼り付けないでください。
