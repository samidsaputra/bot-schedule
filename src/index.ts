import { Telegraf, Markup, Context } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import 'dotenv/config';

// ============================================
// KONFIGURASI
// ============================================
const CONFIG = {
  ADMIN_IDS: [7273127933] as number[],
  GROUP_CHAT_ID: -1002447913210,
  CLAIM_HOURS: { START: 8, END: 18 },
  TIMEZONE: 'Asia/Jakarta',
} as const;

const bot = new Telegraf(process.env.BOT_TOKEN!);
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

// --- DATA STATIS TUGAS HARIAN ---
const DAILY_TASK_PAIRS: string[][] = [
  ['Cek Order by tools CARENT', 'Cek Order by tools CRM'],
  ['Mengubah Status Pending BASO ke Pending Billing Approval (Dorong Order)', 'Input Data Activity by MyTens'],
  ['Rekap Pengiriman dan Pengembalian Berkas', 'Pengawalan AO SODOMORO (Report)'],
  ['Cek Tender Client', 'Mencatat Order dari Delivery ke Google Sheet "ORDER 2025/2026"'],
];

// --- DATA STATIS TUGAS BULANAN ---
const MONTHLY_TASK_LIST = [
  { content: 'Membuat Laporan Performansi Bulanan', start: 1, end: 5 },
  { content: 'Rekap Data Insentif Tim', start: 25, end: 30 },
  { content: 'Update Database Client Tahunan', start: 10, end: 15 },
];

// ============================================
// HELPER FUNCTIONS
// ============================================
const DateHelper = {
  getTodayDate: () => new Date().toLocaleDateString('en-CA', { timeZone: CONFIG.TIMEZONE }),
  getCurrentMonth: () => new Date().toLocaleDateString('en-CA', { timeZone: CONFIG.TIMEZONE }).slice(0, 7),
  getTodayDay: () => parseInt(new Date().toLocaleDateString('en-CA', { timeZone: CONFIG.TIMEZONE }).slice(8, 10), 10),
  getCurrentHour: () => parseInt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', timeZone: CONFIG.TIMEZONE }), 10),

  isWeekday: () => {
    const day = new Date(new Date().toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE })).getDay();
    return day !== 0 && day !== 6; // 0 = Minggu, 6 = Sabtu
  },

  isClaimAllowed: () => {
    if (!DateHelper.isWeekday()) return false;
    const hour = DateHelper.getCurrentHour();
    return hour >= CONFIG.CLAIM_HOURS.START && hour < CONFIG.CLAIM_HOURS.END;
  },
};

const UserHelper = {
  getIdentifier: (user: any) => user.username ? `@${user.username}` : user.first_name,
  isAdmin: (userId: number) => CONFIG.ADMIN_IDS.includes(userId),
};

// ============================================
// DATABASE OPERATIONS
// ============================================
const TaskDB = {
  async seedAll() {
    if (!DateHelper.isWeekday()) return;

    const today = DateHelper.getTodayDate();
    const month = DateHelper.getCurrentMonth();

    const { data: dailyExist } = await supabase.from('schedules').select('id').eq('date', today).limit(1);
    if (!dailyExist || dailyExist.length === 0) {
      const rows = DAILY_TASK_PAIRS.map((pair, idx) => ({
        date: today,
        pair_index: idx,
        content: pair.join('\n'),
        is_done: false,
        user_id: CONFIG.ADMIN_IDS[0]
      }));
      await supabase.from('schedules').insert(rows);
    }

    const { data: monthlyExist } = await supabase.from('monthly_tasks').select('id').eq('month', month).limit(1);
    if (!monthlyExist || monthlyExist.length === 0) {
      const rows = MONTHLY_TASK_LIST.map(t => ({
        content: t.content,
        month: month,
        date_start: t.start,
        date_end: t.end,
        is_done: false,
        user_id: CONFIG.ADMIN_IDS[0]
      }));
      await supabase.from('monthly_tasks').insert(rows);
    }
  },

  async getDaily() {
    const { data } = await supabase.from('schedules').select('*').eq('date', DateHelper.getTodayDate()).order('pair_index', { ascending: true });
    return data || [];
  },

  async getMonthly() {
    const { data } = await supabase.from('monthly_tasks').select('*').eq('month', DateHelper.getCurrentMonth()).order('date_start', { ascending: true });
    return data || [];
  }
};

// ============================================
// CORE LOGIC - SEND FUNCTIONS
// ============================================

async function sendDailyTasks(ctx: any, targetChatId?: number) {
  if (!DateHelper.isWeekday()) {
    if (ctx) await ctx.reply('🏝️ Bot sedang libur di akhir pekan!');
    return;
  }

  const chatId = targetChatId || ctx.chat.id;
  const data = await TaskDB.getDaily();
  if (!data.length) return;

  await bot.telegram.sendMessage(chatId, `<b>📅 TUGAS HARIAN (${DateHelper.getTodayDate()})</b>`, { parse_mode: 'HTML' });
  for (const row of data) {
    const tasks = (row.content as string).split('\n').map(t => `• ${t}`).join('\n');
    const status = row.taken_by ? `✅ PIC: ${row.taken_by}` : '❌ Belum ada yang ambil';
    const btn = !row.taken_by ? Markup.button.callback('🙋 Ambil Task', `claim_daily_${row.id}`) : Markup.button.callback('🔄 Batal Ambil', `undo_daily_${row.id}`);
    await bot.telegram.sendMessage(chatId, `<b>📦 Task ${(row.pair_index ?? 0) + 1}</b>\n${tasks}\n\n${status}`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[btn]])
    });
  }
}

async function sendMonthlyTasks(ctx: any) {
  const data = await TaskDB.getMonthly();
  if (!data.length) return ctx.reply('📭 Tugas bulanan belum tersedia.');

  const todayDay = DateHelper.getTodayDay();
  await ctx.reply(`<b>📆 TUGAS BULANAN (${DateHelper.getCurrentMonth()})</b>`, { parse_mode: 'HTML' });
  for (const task of data) {
    const status = task.taken_by ? `✅ PIC: ${task.taken_by}` : '❌ Belum ada yang ambil';
    const active = (todayDay >= (task.date_start || 0) && todayDay <= (task.date_end || 31)) ? '🟢' : '⚪';
    const btn = !task.taken_by ? Markup.button.callback('🙋 Ambil Tugas', `claim_monthly_${task.id}`) : Markup.button.callback('🔄 Batal Ambil', `undo_monthly_${task.id}`);

    await ctx.reply(`📝 <b>${task.content}</b> ${active}\n\n${status}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btn]]) });
  }
}

// ============================================
// HANDLERS
// ============================================

bot.start((ctx) => ctx.reply('🤖 <b>Bot Koordinasi Aktif!</b>', {
  parse_mode: 'HTML',
  reply_markup: {
    keyboard: [[{ text: '📅 Tugas Hari Ini' }, { text: '📆 Tugas Bulanan' }]],
    resize_keyboard: true
  }
}));

bot.hears(['📅 Tugas Hari Ini', /tugas harian/i, /jadwal hari ini/i], (ctx) => sendDailyTasks(ctx));
bot.hears(['📆 Tugas Bulanan', /tugas bulanan/i, /jadwal bulanan/i], (ctx) => sendMonthlyTasks(ctx));

// --- CALLBACK KLAIM ---
bot.action(/claim_(daily|monthly)_(.+)/, async (ctx) => {
  const [type, id] = [ctx.match[1], ctx.match[2]];

  if (!DateHelper.isClaimAllowed()) {
    return ctx.answerCbQuery('⏰ Klaim tersedia Senin-Jumat pukul 08:00-18:00 WIB.', { show_alert: true });
  }

  const user = UserHelper.getIdentifier(ctx.from);
  const table = type === 'daily' ? 'schedules' : 'monthly_tasks';

  const { data } = await supabase.from(table).select('taken_by').eq('id', id).single();
  if (data?.taken_by) return ctx.answerCbQuery('⚠️ Sudah diambil orang lain.', { show_alert: true });

  await supabase.from(table).update({ taken_by: user }).eq('id', id);
  await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.button.callback('🔄 Batal Ambil', `undo_${type}_${id}`)]]).reply_markup);
  ctx.answerCbQuery('✅ Berhasil diambil!');
});

// --- CALLBACK UNDO (PROTEKSI) ---
bot.action(/undo_(daily|monthly)_(.+)/, async (ctx) => {
  const [type, id] = [ctx.match[1], ctx.match[2]];
  const table = type === 'daily' ? 'schedules' : 'monthly_tasks';
  const user = UserHelper.getIdentifier(ctx.from);

  const { data } = await supabase.from(table).select('taken_by').eq('id', id).single();

  // Proteksi: Hanya PIC asli atau Admin yang bisa membatalkan
  if (data?.taken_by !== user && !UserHelper.isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('⚠️ Kamu bukan PIC tugas ini! Akses ditolak.', { show_alert: true });
  }

  await supabase.from(table).update({ taken_by: null }).eq('id', id);
  const label = type === 'daily' ? '🙋 Ambil Paket' : '🙋 Ambil Tugas';
  await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.button.callback(label, `claim_${type}_${id}`)]]).reply_markup);
  ctx.answerCbQuery('🔄 Klaim dibatalkan.');
});

// ============================================
// CRON (AUTO KIRIM JAM 08:00)
// ============================================
cron.schedule('0 8 * * 1-5', async () => {
  await TaskDB.seedAll();
  await sendDailyTasks(null, CONFIG.GROUP_CHAT_ID);
}, { timezone: CONFIG.TIMEZONE });

// ============================================
// LAUNCH
// ============================================
bot.launch().then(() => {
  console.log('🚀 BOT READY!');
  TaskDB.seedAll();
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));