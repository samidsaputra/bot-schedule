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

// --- START ---
bot.start((ctx) => {
  ctx.reply(`Halo ${ctx.from.first_name}! Langsung aja copas jadwal lo di sini, nanti gue rapihin otomatis.`, mainMenu);
});

// --- TOMBOL TAMBAH ---
bot.hears('➕ Tambah Agenda', (ctx) => {
  ctx.reply('Silakan langsung kirim atau copas teks jadwal lo di sini.\n\nContoh:\n08:00 Sarapan\n09:00 Start Kerja\n10:00 @Meeting');
});

// --- LOGIKA UTAMA: DETEKSI SEMUA PESAN ---
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  // Lewati jika user klik tombol menu (biar nggak double proses)
  if (text.includes('📅') || text.includes('➕') || text.includes('🗑️') || text.startsWith('/')) {
    return;
  }

  // REGEX: Mencari jam HH:mm dan teks setelahnya
  const regex = /(\d{2}:\d{2})\s*(?:-|@|start|)\s*([^\n]+)/gi;
  let match;
  const schedulesFound = [];

  while ((match = regex.exec(text)) !== null) {
    schedulesFound.push({
      user_id: ctx.from.id,
      time: `${match[1]}:00`,
      content: match[2].trim().substring(0, 100)
    });
  }

  // Jika ditemukan jadwal dalam teks
  if (schedulesFound.length > 0) {
    const { error } = await supabase.from('schedules').insert(schedulesFound);

    if (error) {
      console.error(error);
      return ctx.reply('❌ Gagal nyambung ke database.');
    }

    return ctx.reply(`✅ Berhasil! *${schedulesFound.length}* jadwal baru ditambahkan.`, {
      parse_mode: 'Markdown',
      ...mainMenu
    });
  } else {
    // Jika user kirim chat biasa tanpa format jam
    ctx.reply('Gue nggak nemu format jam (HH:mm) di pesan lo. Coba kirim kayak: "08:00 Makan"');
  }
});

// --- LIHAT JADWAL ---
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

// --- HAPUS SEMUA ---
bot.hears('🗑️ Hapus Semua', async (ctx) => {
  await supabase.from('schedules').delete().eq('user_id', ctx.from.id);
  ctx.reply('🗑️ Semua jadwal dihapus!', mainMenu);
});

// --- REMINDER ---
cron.schedule('* * * * *', async () => {
  const skrg = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });
  const { data } = await supabase.from('schedules').select('*').eq('time', `${skrg}:00`);
  data?.forEach(item => {
    bot.telegram.sendMessage(item.user_id, `🔔 *PENGINGAT:* Jam ${skrg}, waktunya: *${item.content}*`, { parse_mode: 'Markdown' });
  });
}, { timezone: "Asia/Jakarta" });

bot.launch().then(() => console.log('🚀 Bot Active!'));