import { Telegraf, Context } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import 'dotenv/config';

// =============================================
// 1. INISIALISASI BOT & SUPABASE
// =============================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!BOT_TOKEN) throw new Error('❌ BOT_TOKEN tidak ditemukan di .env');
if (!SUPABASE_URL) throw new Error('❌ SUPABASE_URL tidak ditemukan di .env');
if (!SUPABASE_KEY) throw new Error('❌ SUPABASE_KEY tidak ditemukan di .env');

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================
// 2. STATE MANAGEMENT (untuk multi-step input)
// =============================================
// Menyimpan state user yang sedang dalam proses input
const userState: Map<number, string> = new Map();

// =============================================
// 3. KEYBOARD MENUS
// =============================================
const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '📅 Jadwal Hari Ini' }],
      [{ text: '➕ Tambah Agenda' }, { text: '🗑️ Hapus Agenda' }],
      [{ text: 'ℹ️ Bantuan' }],
    ],
    resize_keyboard: true,
  },
};

// =============================================
// 4. HELPER FUNCTIONS
// =============================================

/** Mendapatkan waktu sekarang dalam format HH:MM (WIB) */
function getWIBTime(): string {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

/** Mendapatkan tanggal sekarang dalam format YYYY-MM-DD (WIB) */
function getWIBDate(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta',
  });
}

// =============================================
// 5. HANDLER: START
// =============================================
bot.start((ctx) => {
  const nama = ctx.from.first_name ?? 'Bro';
  ctx.reply(
    `👋 Halo *${nama}*! Gue asisten jadwal lo.\n\n` +
    `Gue bisa bantuin lo:\n` +
    `📅 Lihat jadwal hari ini\n` +
    `➕ Tambah agenda baru\n` +
    `🗑️ Hapus agenda tertentu\n` +
    `🔔 Kirim reminder otomatis saat waktunya tiba\n\n` +
    `Pilih menu di bawah buat mulai!`,
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// =============================================
// 6. HANDLER: BANTUAN
// =============================================
bot.hears('ℹ️ Bantuan', (ctx) => {
  ctx.reply(
    `*📖 Panduan Penggunaan Bot Jadwal*\n\n` +
    `*Tambah Agenda:*\n` +
    `Ketuk ➕ Tambah Agenda, lalu balas dengan format:\n` +
    "`HH:MM Nama Kegiatan`\n" +
    `Contoh: \`07:30 Olahraga Pagi\`\n\n` +
    `*Lihat Jadwal:*\n` +
    `Ketuk 📅 Jadwal Hari Ini untuk melihat semua agenda hari ini.\n\n` +
    `*Hapus Agenda:*\n` +
    `Ketuk 🗑️ Hapus Agenda, lalu pilih nomor agenda yang ingin dihapus.\n\n` +
    `*Reminder Otomatis:*\n` +
    `Bot akan mengirim notifikasi otomatis saat waktunya tiba! 🔔`,
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// =============================================
// 7. HANDLER: TAMBAH AGENDA
// =============================================
bot.hears('➕ Tambah Agenda', (ctx) => {
  const userId = ctx.from.id;
  userState.set(userId, 'waiting_agenda');

  ctx.reply(
    '✏️ *Tambah Agenda*\n\n' +
    'Kirim pesan dengan salah satu cara:\n\n' +
    '*Format singkat:*\n' +
    '`08:30 Rapat Pagi`\n\n' +
    '*Atau paste teks panjang langsung* (bot otomatis cari jamnya):*\n' +
    '_Contoh: paste briefing tim, jadwal lengkap, dsb._\n\n' +
    'Ketik /batal untuk membatalkan.',
    { parse_mode: 'Markdown' }
  );
});

// =============================================
// 8. HANDLER: LIHAT JADWAL
// =============================================
bot.hears('📅 Jadwal Hari Ini', async (ctx) => {
  const userId = ctx.from.id;
  const today = getWIBDate();

  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .order('time', { ascending: true });

  if (error) {
    console.error('Error ambil jadwal:', error);
    return ctx.reply('❌ Gagal mengambil data. Coba lagi ya!');
  }

  if (!data || data.length === 0) {
    return ctx.reply(
      `📭 Kosong bro! Belum ada agenda untuk hari ini.\n\nTambah agenda dengan ketuk ➕ Tambah Agenda`,
      mainMenu
    );
  }

  const tanggal = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Jakarta',
  });

  const list = data
    .map((s, i) => {
      const status = s.is_done ? '✅' : '⏰';
      return `${status} *${i + 1}.* ${s.time.slice(0, 5)} - ${s.content}`;
    })
    .join('\n');

  ctx.reply(
    `📅 *Jadwal Lo - ${tanggal}*\n\n${list}\n\n_Total: ${data.length} agenda_`,
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// =============================================
// 9. HANDLER: HAPUS AGENDA
// =============================================
bot.hears('🗑️ Hapus Agenda', async (ctx) => {
  const userId = ctx.from.id;
  const today = getWIBDate();

  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .order('time', { ascending: true });

  if (error || !data || data.length === 0) {
    return ctx.reply('📭 Tidak ada agenda hari ini untuk dihapus.', mainMenu);
  }

  const list = data
    .map((s, i) => `${i + 1}. ${s.time.slice(0, 5)} - ${s.content}`)
    .join('\n');

  // Simpan list ID ke state untuk digunakan saat hapus
  userState.set(userId, `waiting_delete:${data.map((s) => s.id).join(',')}`);

  ctx.reply(
    `🗑️ *Pilih agenda yang mau dihapus:*\n\n${list}\n\n` +
    `Balas dengan *nomor urut* agenda (misal: \`1\`).\n` +
    `Ketik \`semua\` untuk hapus semua jadwal hari ini.\n` +
    `Ketik /batal untuk membatalkan.`,
    { parse_mode: 'Markdown' }
  );
});

// =============================================
// 10. HANDLER: BATAL
// =============================================
bot.command('batal', (ctx) => {
  const userId = ctx.from.id;
  userState.delete(userId);
  ctx.reply('✅ Dibatalkan.', mainMenu);
});

// =============================================
// 11. HANDLER: PESAN MASUK (STATE MACHINE)
// =============================================
bot.on('message', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState.get(userId);

  // Ambil teks pesan
  const message = ctx.message;
  if (!('text' in message)) return;
  const text = message.text.trim();

  // ---- STATE: Menunggu input agenda baru (Smart Paste) ----
  if (state === 'waiting_agenda') {
    // Cari pola jam di mana saja dalam teks (HH:MM atau H:MM)
    const timeRegex = /(\d{1,2}:\d{2})/;
    const timeMatch = text.match(timeRegex);

    if (timeMatch) {
      // ✅ Jam ditemukan — simpan seluruh teks sebagai konten
      const timePart = timeMatch[1];
      const timeFormatted = timePart.padStart(5, '0');
      const today = getWIBDate();

      const { error } = await supabase.from('schedules').insert([
        {
          user_id: userId,
          date: today,
          time: `${timeFormatted}:00`,
          content: text, // Simpan SELURUH teks (termasuk deskripsi panjang)
          is_done: false,
        },
      ]);

      if (error) {
        console.error('Error insert jadwal:', error);
        return ctx.reply('❌ Gagal menyimpan jadwal ke database. Coba lagi!');
      }

      userState.delete(userId);
      // Preview konten — potong jika terlalu panjang untuk preview
      const preview = text.length > 100 ? text.slice(0, 100) + '...' : text;
      return ctx.reply(
        `✅ *Agenda berhasil disimpan!*\n\n` +
        `⏰ Jam: *${timeFormatted}*\n` +
        `📝 Deskripsi: _${preview}_\n\n` +
        `Reminder otomatis akan dikirim saat waktunya tiba! 🔔`,
        { parse_mode: 'Markdown', ...mainMenu }
      );
    } else {
      // ⏳ Jam tidak ditemukan — tanya dulu ke user
      // Simpan teks ke state sementara
      userState.set(userId, `waiting_time:${text}`);
      return ctx.reply(
        '🕐 Jam tidak ditemukan di pesan kamu.\n\n' +
        'Jam berapa agenda ini dijadwalkan?\n' +
        'Balas dengan format: `HH:MM` (contoh: `08:30`)\n\n' +
        'Ketik /batal untuk membatalkan.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  // ---- STATE: Menunggu jam untuk teks yang sudah disimpan ----
  if (state && state.startsWith('waiting_time:')) {
    const savedText = state.replace('waiting_time:', '');
    const timeOnlyRegex = /^(\d{1,2}:\d{2})$/;
    const match = text.match(timeOnlyRegex);

    if (!match) {
      return ctx.reply(
        '❌ Format jam salah. Gunakan `HH:MM` (contoh: `09:00`)\n\nAtau ketik /batal.',
        { parse_mode: 'Markdown' }
      );
    }

    const timeFormatted = match[1].padStart(5, '0');
    const today = getWIBDate();

    const { error } = await supabase.from('schedules').insert([
      {
        user_id: userId,
        date: today,
        time: `${timeFormatted}:00`,
        content: savedText,
        is_done: false,
      },
    ]);

    if (error) {
      console.error('Error insert jadwal:', error);
      return ctx.reply('❌ Gagal menyimpan jadwal ke database. Coba lagi!');
    }

    userState.delete(userId);
    const preview = savedText.length > 100 ? savedText.slice(0, 100) + '...' : savedText;
    return ctx.reply(
      `✅ *Agenda berhasil disimpan!*\n\n` +
      `⏰ Jam: *${timeFormatted}*\n` +
      `📝 Deskripsi: _${preview}_\n\n` +
      `Reminder otomatis akan dikirim saat waktunya tiba! 🔔`,
      { parse_mode: 'Markdown', ...mainMenu }
    );
  }

  // ---- STATE: Menunggu nomor agenda yang dihapus ----
  if (state && state.startsWith('waiting_delete:')) {
    const idList = state.replace('waiting_delete:', '').split(',');
    const today = getWIBDate();

    if (text.toLowerCase() === 'semua') {
      // Hapus semua jadwal hari ini
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('user_id', userId)
        .eq('date', today);

      userState.delete(userId);
      if (error) return ctx.reply('❌ Gagal menghapus semua jadwal.');
      return ctx.reply('🗑️ Semua jadwal hari ini berhasil dihapus!', mainMenu);
    }

    const num = parseInt(text);
    if (isNaN(num) || num < 1 || num > idList.length) {
      return ctx.reply(
        `❌ Nomor tidak valid. Masukkan angka 1 sampai ${idList.length}.`
      );
    }

    const targetId = idList[num - 1];
    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', targetId);

    userState.delete(userId);
    if (error) return ctx.reply('❌ Gagal menghapus agenda.');
    return ctx.reply(`✅ Agenda nomor ${num} berhasil dihapus!`, mainMenu);
  }

  // ---- Pesan tidak dikenali ----
  ctx.reply(
    '🤔 Hmm, gue ga ngerti tuh. Pakai menu di bawah ya!',
    mainMenu
  );
});

// =============================================
// 12. CRON JOB: AUTO REMINDER (TIAP MENIT)
// =============================================
cron.schedule(
  '* * * * *',
  async () => {
    const sekarang = getWIBTime();
    const today = getWIBDate();

    console.log(`[CRON] Cek reminder jam ${sekarang} tanggal ${today}`);

    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('date', today)
      .eq('time', `${sekarang}:00`)
      .eq('is_done', false);

    if (error) {
      console.error('[CRON] Error ambil jadwal untuk reminder:', error);
      return;
    }

    if (data && data.length > 0) {
      console.log(`[CRON] Mengirim ${data.length} reminder...`);
      for (const item of data) {
        try {
          await bot.telegram.sendMessage(
            item.user_id,
            `🔔 *REMINDER!*\n\nSekarang jam *${sekarang}*, waktunya:\n👉 *${item.content}*\n\nSemangat! 💪`,
            { parse_mode: 'Markdown' }
          );

          // Tandai jadwal sebagai sudah diingatkan
          await supabase
            .from('schedules')
            .update({ is_done: true })
            .eq('id', item.id);
        } catch (err) {
          console.error(`[CRON] Gagal kirim reminder ke user ${item.user_id}:`, err);
        }
      }
    }
  },
  {
    timezone: 'Asia/Jakarta',
  }
);

// =============================================
// 13. LAUNCH BOT
// =============================================
bot
  .launch()
  .then(() => {
    console.log('🚀 Bot Schedule Teman berhasil jalan!');
    console.log(`⏰ Waktu server: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`);
  })
  .catch((err) => {
    console.error('❌ Gagal menjalankan bot:', err);
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
