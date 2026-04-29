import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import 'dotenv/config';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '📅 Lihat Jadwal Hari Ini' }],
      [{ text: '➕ Tambah Agenda' }, { text: '🗑️ Hapus Semua' }]
    ],
    resize_keyboard: true
  }
};

bot.start((ctx) => {
  ctx.reply(`Halo ${ctx.from.first_name}! Kirim teks panjang lo, nanti gue rapihin jadi jadwal otomatis.`, mainMenu);
});

bot.hears('➕ Tambah Agenda', (ctx) => {
  ctx.reply(
    'Silakan *Reply* dengan teks panjang atau list tugas lo.\n\nContoh format yang terbaca:\n- 08:00 Makan\n- Start 09:30 Meeting\n- 1. 10:00 Kerja',
    {
      parse_mode: 'Markdown',
      reply_markup: { force_reply: true }
    }
  );
});

bot.on('message', async (ctx) => {
  if ('reply_to_message' in ctx.message && ctx.message.reply_to_message) {
    const originalText = (ctx.message.reply_to_message as any).text || '';

    if (originalText.includes('Silakan Reply dengan teks panjang')) {
      const input = (ctx.message as any).text;

      // REGEX CANGGIH: Mencari semua pola jam (HH:mm) dan teks setelahnya dalam satu pesan
      // Pola ini mencari jam, lalu mengambil kata-kata setelahnya sampai ketemu baris baru
      const regex = /(\d{2}:\d{2})\s*(?:-|@|start|)\s*([^\n]+)/gi;

      let match;
      const schedulesFound = [];

      while ((match = regex.exec(input)) !== null) {
        schedulesFound.push({
          user_id: ctx.from.id,
          time: `${match[1]}:00`,
          content: match[2].trim().substring(0, 100) // Batasi 100 karakter per baris
        });
      }

      if (schedulesFound.length === 0) {
        return ctx.reply('❌ Gue nggak nemu format jam (HH:mm) di teks itu. Coba cek lagi.');
      }

      // Simpan semua jadwal yang ditemukan sekaligus (Bulk Insert)
      const { error } = await supabase.from('schedules').insert(schedulesFound);

      if (error) {
        console.error(error);
        return ctx.reply('❌ Gagal masukin ke database.');
      }

      ctx.reply(`✅ Berhasil! Gue nemu dan nambahin *${schedulesFound.length}* jadwal baru.`, {
        parse_mode: 'Markdown',
        ...mainMenu
      });
    }
  }
});

bot.hears('📅 Lihat Jadwal Hari Ini', async (ctx) => {
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('user_id', ctx.from.id)
    .order('time', { ascending: true });

  if (error) return ctx.reply('❌ Gagal ambil data.');
  if (!data || data.length === 0) return ctx.reply('Jadwal lo kosong.');

  const list = data.map(s => `⏰ *${s.time.slice(0, 5)}* - ${s.content}`).join('\n');
  ctx.reply(`📅 *Jadwal Rapi Lo:*\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.hears('🗑️ Hapus Semua', async (ctx) => {
  await supabase.from('schedules').delete().eq('user_id', ctx.from.id);
  ctx.reply('🗑️ Semua jadwal dihapus!', mainMenu);
});

// Reminder tetap jalan tiap menit
cron.schedule('* * * * *', async () => {
  const skrg = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  });

  const { data } = await supabase.from('schedules').select('*').eq('time', `${skrg}:00`);

  data?.forEach(item => {
    bot.telegram.sendMessage(item.user_id, `🔔 *PENGINGAT:* Sekarang jam ${skrg}, waktunya: *${item.content}*`, { parse_mode: 'Markdown' });
  });
}, { timezone: "Asia/Jakarta" });

bot.launch().then(() => console.log('🚀 Bot Multi-Schedule Ready!'));