import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import 'dotenv/config';

// 1. Inisialisasi Bot & Supabase
const bot = new Telegraf(process.env.BOT_TOKEN!);
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

// 2. Menu Utama (Keyboard)
const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '📅 Lihat Jadwal Hari Ini' }],
      [{ text: '➕ Tambah Agenda' }, { text: '🗑️ Hapus Semua' }]
    ],
    resize_keyboard: true
  }
};

// --- HANDLER: START ---
bot.start((ctx) => {
  ctx.reply(
    `Halo ${ctx.from.first_name}! Gue asisten jadwal lo. Silakan pilih menu di bawah:`,
    mainMenu
  );
});

// --- HANDLER: TOMBOL TAMBAH AGENDA ---
bot.hears('➕ Tambah Agenda', (ctx) => {
  ctx.reply(
    'Silakan *Reply* pesan ini dengan format:\n\n`Jam` `Nama Kegiatan` \nContoh: `07:30 Olahraga Pagi` \n\n(Kalau paste teks panjang, gue cuma ambil baris pertamanya aja ya!)',
    {
      parse_mode: 'Markdown',
      reply_markup: { force_reply: true }
    }
  );
});

// --- HANDLER: PROSES INPUT (REPLY SYSTEM) ---
bot.on('message', async (ctx) => {
  if ('reply_to_message' in ctx.message && ctx.message.reply_to_message) {
    const originalText = (ctx.message.reply_to_message as any).text || '';

    if (originalText.includes('Silakan Reply pesan ini')) {
      const input = (ctx.message as any).text;

      // REGEX: Mengambil jam di awal, dan mengambil teks HANYA sampai baris baru pertama ([^\n]+)
      const regex = /^(\d{2}:\d{2})\s+([^\n]+)/;
      const match = input.match(regex);

      if (!match) {
        return ctx.reply('❌ Format salah! Gunakan HH:mm di awal teks (Contoh: 08:30 Absen Intern)');
      }

      const time = match[1];
      let content = match[2].trim();

      // Limit teks agar tidak merusak tampilan list (max 60 karakter)
      if (content.length > 60) {
        content = content.substring(0, 57) + '...';
      }

      // Simpan ke Supabase
      const { error } = await supabase.from('schedules').insert([
        {
          user_id: ctx.from.id,
          time: `${time}:00`,
          content: content
        }
      ]);

      if (error) {
        console.error(error);
        return ctx.reply('❌ Waduh, gagal nyambung ke database.');
      }

      ctx.reply(`✅ Mantap! "${content}" jam ${time} udah masuk list.`, mainMenu);
    }
  }
});

// --- HANDLER: LIHAT JADWAL ---
bot.hears('📅 Lihat Jadwal Hari Ini', async (ctx) => {
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('user_id', ctx.from.id)
    .order('time', { ascending: true });

  if (error) return ctx.reply('❌ Gagal ambil data.');

  if (!data || data.length === 0) {
    return ctx.reply('Kosong bro. Belum ada agenda buat hari ini.');
  }

  const list = data
    .map((s) => `⏰ *${s.time.slice(0, 5)}* - ${s.content}`)
    .join('\n');

  ctx.reply(`📅 *Jadwal Lo Hari Ini:*\n\n${list}`, { parse_mode: 'Markdown' });
});

// --- HANDLER: HAPUS SEMUA JADWAL ---
bot.hears('🗑️ Hapus Semua', async (ctx) => {
  const { error } = await supabase
    .from('schedules')
    .delete()
    .eq('user_id', ctx.from.id);

  if (error) return ctx.reply('❌ Gagal menghapus jadwal.');
  ctx.reply('🗑️ Semua jadwal lo udah dibersihin!', mainMenu);
});

// --- CRON JOB: AUTO REMINDER (TIAP MENIT) ---
cron.schedule('* * * * *', async () => {
  const sekarang = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  });

  const { data } = await supabase
    .from('schedules')
    .select('*')
    .eq('time', `${sekarang}:00`);

  if (data && data.length > 0) {
    data.forEach((item) => {
      bot.telegram.sendMessage(
        item.user_id,
        `🔔 *REMINDER!*\n\nSekarang jam *${sekarang}*, waktunya: \n👉 *${item.content}*`,
        { parse_mode: 'Markdown' }
      );
    });
  }
}, {
  timezone: "Asia/Jakarta"
});

// --- LAUNCH ---
bot.launch().then(() => {
  console.log('🚀 Bot Schedule Teman Berhasil Jalan!');
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));