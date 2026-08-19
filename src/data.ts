export type Channel = {
  id: string;
  label: string;
  kind: "text" | "voice";
  unread?: number;
  activeUsers?: number;
};

export type Member = {
  name: string;
  avatar: string;
  status: "online" | "away" | "offline";
  role: "運営" | "モデレーター" | "メンバー";
  detail?: string;
};

export type ChatMessage = {
  id: string | number;
  author: string;
  avatar: string;
  time: string;
  lines: string[];
  reply?: { author: string; body: string; avatar: string };
  threadLabel?: string;
  afterReply?: string;
  attachment?: boolean;
  reaction?: number;
};

export const assets = {
  logo: "/assets/ui/aster-mark.png",
  mountain: "/assets/ui/guild-mountain.png",
  ocean: "/assets/ui/guild-ocean.png",
  sakura: "/assets/ui/guild-sakura.png",
  akari: "/assets/ui/avatar-akari.png",
  ryo: "/assets/ui/avatar-ryo.png",
  minasaki: "/assets/ui/avatar-minasaki.png",
  flyer: "/assets/ui/event-flyer.png",
};

export const guilds = [
  { id: "aster", name: "星屑コミュニティ", image: assets.logo },
  { id: "mountain", name: "山歩きの会", image: assets.mountain },
  { id: "ocean", name: "青の写真部", image: assets.ocean },
  { id: "sakura", name: "春の読書室", image: assets.sakura },
  { id: "design", name: "デザイン談話室", image: assets.mountain },
  { id: "music", name: "夜の音楽室", image: assets.ocean },
];

export const channels: Channel[] = [
  { id: "news", label: "お知らせ", kind: "text", unread: 2 },
  { id: "chat", label: "雑談", kind: "text" },
  { id: "event", label: "イベント企画", kind: "text", unread: 1 },
  { id: "photos", label: "写真・作品共有", kind: "text" },
  { id: "support", label: "サポート", kind: "text" },
  { id: "recruit", label: "メンバー募集", kind: "text" },
  { id: "event-voice", label: "イベント企画ミーティング", kind: "voice", activeUsers: 3 },
  { id: "lounge", label: "雑談ラウンジ", kind: "voice", activeUsers: 0 },
];

export const members: Member[] = [
  { name: "あかり", avatar: assets.akari, status: "online", role: "運営", detail: "イベント運営" },
  { name: "りょう", avatar: assets.ryo, status: "online", role: "運営", detail: "コミュニティ管理" },
  { name: "みさき", avatar: assets.minasaki, status: "online", role: "運営", detail: "デザイン" },
  { name: "ユウタ", avatar: assets.ryo, status: "online", role: "モデレーター", detail: "モデレーター" },
  { name: "サクラ", avatar: assets.akari, status: "away", role: "モデレーター", detail: "取り込み中" },
  { name: "Aster（あなた）", avatar: assets.mountain, status: "online", role: "メンバー", detail: "オンライン" },
  { name: "Kenji", avatar: assets.ryo, status: "online", role: "メンバー" },
  { name: "はるか", avatar: assets.minasaki, status: "online", role: "メンバー" },
  { name: "たくみ", avatar: assets.ryo, status: "offline", role: "メンバー", detail: "退席中" },
  { name: "まい", avatar: assets.akari, status: "online", role: "メンバー" },
  { name: "ゆき", avatar: assets.minasaki, status: "offline", role: "メンバー", detail: "2時間前" },
];

export const initialMessages: ChatMessage[] = [
  {
    id: 1,
    author: "みさき",
    avatar: assets.minasaki,
    time: "10:12",
    lines: [
      "みなさん、おはようございます！",
      "先日のミーティングの続きで、イベントの具体的な内容を決めたいと思います。まずは候補日程の確認からお願いします。",
    ],
    reaction: 2,
  },
  {
    id: 2,
    author: "りょう",
    avatar: assets.ryo,
    time: "10:15",
    lines: [
      "自分の案としては、10/24（土）か10/25（日）が良いかなと思っています。",
      "会場は市民センターの多目的ホールを仮押さえできそうです。",
      "どちらの日程も13:00〜17:00でいけそうです！",
    ],
  },
  {
    id: 3,
    author: "Aster",
    avatar: assets.mountain,
    time: "10:18",
    lines: ["ありがとうございます！", "10/24（土）で進める方向で仮決定ということでよいでしょうか？"],
    reply: {
      author: "みさき  10:20",
      avatar: assets.minasaki,
      body: "10/24（土）で進める方向で仮決定ということでよいですか？",
    },
    threadLabel: "1件の返信",
    afterReply: "はい、問題ないです！",
    reaction: 1,
  },
  {
    id: 4,
    author: "あかり",
    avatar: assets.akari,
    time: "10:22",
    lines: ["チラシのドラフトを作ってみました。ご確認お願いします〜"],
    attachment: true,
    reaction: 1,
  },
];
