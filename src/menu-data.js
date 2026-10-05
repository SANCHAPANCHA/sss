export const categories = [
  { id: 'burgers', title: 'Бургеры', icon: '🍔' },
  { id: 'snacks', title: 'Закуски', icon: '🍟' },
  { id: 'drinks', title: 'Напитки', icon: '🥤' },
  { id: 'desserts', title: 'Десерты', icon: '🍦' },
];

export const items = [
  { id: 'classic', cat: 'burgers', emoji: '🍔', name: 'Классик', price: 490, weight: 320, kcal: 680,
    desc: 'Говяжья котлета 180 г, чеддер, томат, айсберг, маринованный огурец, фирменный соус.', tags: ['hit'] },
  { id: 'double', cat: 'burgers', emoji: '🍔', name: 'Дабл Смэш', price: 690, weight: 420, kcal: 940,
    desc: 'Две смэш-котлеты с хрустящей корочкой, двойной чеддер, лук, горчичный соус.', tags: ['hit', 'new'] },
  { id: 'bbq', cat: 'burgers', emoji: '🥓', name: 'BBQ Бекон', price: 640, weight: 380, kcal: 860,
    desc: 'Котлета 180 г, хрустящий бекон, луковые кольца, копчёный BBQ-соус, чеддер.', tags: [] },
  { id: 'hot', cat: 'burgers', emoji: '🌶️', name: 'Инферно', price: 620, weight: 350, kcal: 720,
    desc: 'Котлета 180 г, халапеньо, перцовый джек, соус шрирача-майо, красный лук.', tags: ['spicy'] },
  { id: 'chicken', cat: 'burgers', emoji: '🐔', name: 'Криспи Чикен', price: 520, weight: 330, kcal: 640,
    desc: 'Куриное бедро в хрустящей панировке, капустный слоу, соус ранч.', tags: [] },
  { id: 'veggie', cat: 'burgers', emoji: '🥑', name: 'Грин', price: 540, weight: 310, kcal: 520,
    desc: 'Котлета из нута и киноа, авокадо, томат, руккола, веган-майо.', tags: ['veg'] },

  { id: 'fries', cat: 'snacks', emoji: '🍟', name: 'Картофель фри', price: 220, weight: 150, kcal: 410,
    desc: 'Хрустящий картофель с морской солью. Соус на выбор.', tags: ['veg'] },
  { id: 'wedges', cat: 'snacks', emoji: '🥔', name: 'Деревенский', price: 250, weight: 180, kcal: 380,
    desc: 'Дольки картофеля с розмарином и чесноком.', tags: ['veg'] },
  { id: 'rings', cat: 'snacks', emoji: '🧅', name: 'Луковые кольца', price: 270, weight: 160, kcal: 450,
    desc: 'В пивном кляре, с соусом барбекю.', tags: [] },
  { id: 'wings', cat: 'snacks', emoji: '🍗', name: 'Крылья Баффало', price: 420, weight: 250, kcal: 590,
    desc: '8 крыльев в остром соусе баффало, сельдерей, соус блю-чиз.', tags: ['spicy', 'hit'] },

  { id: 'cola', cat: 'drinks', emoji: '🥤', name: 'Кола', price: 150, weight: 400, kcal: 170,
    desc: 'Классическая или без сахара, со льдом.', tags: [] },
  { id: 'lemonade', cat: 'drinks', emoji: '🍋', name: 'Домашний лимонад', price: 230, weight: 400, kcal: 120,
    desc: 'Лимон-мята, манго-маракуйя или клубника-базилик.', tags: ['new'] },
  { id: 'shake', cat: 'drinks', emoji: '🥛', name: 'Милкшейк', price: 290, weight: 350, kcal: 480,
    desc: 'Ваниль, шоколад или солёная карамель.', tags: ['hit'] },
  { id: 'beer', cat: 'drinks', emoji: '🍺', name: 'Крафтовое пиво', price: 340, weight: 500, kcal: 220,
    desc: 'Светлый лагер или IPA от местной пивоварни. 18+', tags: [] },

  { id: 'cheesecake', cat: 'desserts', emoji: '🍰', name: 'Чизкейк Нью-Йорк', price: 320, weight: 140, kcal: 430,
    desc: 'Сливочный чизкейк с ягодным соусом.', tags: [] },
  { id: 'sundae', cat: 'desserts', emoji: '🍨', name: 'Санде', price: 240, weight: 150, kcal: 350,
    desc: 'Пломбир, карамель, шоколадная крошка и арахис.', tags: ['veg'] },
  { id: 'donut', cat: 'desserts', emoji: '🍩', name: 'Пончик', price: 160, weight: 90, kcal: 310,
    desc: 'Свежий пончик с глазурью дня.', tags: ['new'] },
];

export const tagInfo = {
  hit: { label: 'Хит', cls: 'tag-hit', icon: '🔥' },
  new: { label: 'Новинка', cls: 'tag-new', icon: '✨' },
  spicy: { label: 'Острое', cls: 'tag-spicy', icon: '🌶️' },
  veg: { label: 'Вег', cls: 'tag-veg', icon: '🌱' },
};
