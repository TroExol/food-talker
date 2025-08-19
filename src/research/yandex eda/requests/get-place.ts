const coordinates = {
  latitude: 57.97857164606642,
  longitude: 56.19363649099609,
};
const place = {
  brandSlug: 'tsuru_cmszp',
  slug: 'tsuru_yaponskij_restoran_lunacharskogo_69',
};

fetch(`https://eda.yandex.ru/api/v2/menu/retrieve/${place.slug}?longitude=${coordinates.longitude}&latitude=${coordinates.latitude}&autoTranslate=false`, {
  headers: {
    'Content-Type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'x-app-version': '17.52.4',
    'x-client-session': 'mei8lrkd-d49t83iglm-2sset7rzpp6-8qnt1cacvd',
    'x-device-id': 'mei8lrkd-fnbl951fo7-vqvkmfvgb8f-cgrtjueuxx8',
    'x-platform': 'desktop_web',
    'x-retpath-y': `https://eda.yandex.ru/r/${place.brandSlug}?placeSlug=${place.slug}`,
    'x-taxi': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 platform=eats_desktop_web',
    'x-ya-client-time': new Date().toISOString(),
    'x-ya-coordinates': `latitude=${coordinates.latitude},longitude=${coordinates.longitude}`,
  },
})
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  .then(res => res.json() as any)
  .then(data => console.log(data.payload.categories))
  .catch(err => console.error(err));

/*
response.payload.categories -
{
"id": 1,
"name": "Что нового",
"available": true,
"items": [],
"gallery": [],
"categories": [],
"informers": [
  {
      "id": "promo_85",
      "text": {
          "value": "0₽ доставка – для заказа от 600 ₽",
          "color": {
              "light": "#72AA52",
              "dark": "#F5F4F2"
          }
      },
      "icon": {
          "light": "https://eda.yandex/images/3816972/0a6904a5dbf6de2762626985e3fc860b.png",
          "dark": "https://eda.yandex/images/3816972/0a6904a5dbf6de2762626985e3fc860b.png"
      },
      "background": {
          "light": {
              "red": 228,
              "green": 242,
              "blue": 220
          },
          "dark": {
              "red": 18,
              "green": 18,
              "blue": 17
          }
      },
      "action": {
          "type": "bottom_sheet",
          "payload": {
              "title": "0₽ доставка",
              "text": "для заказа от 600 ₽",
              "type": "bottom_sheet"
          }
      }
  }
]
},
{
"name": "Выбор пользователей",
"available": true,
"items": [
  {
      "id": 5000000014544067,
      "name": "Пряный рамен с говядиной",
      "description": "",
      "descriptions": [
          {
              "title": "Состав",
              "text": "говядина, пшеничная лапша, шампиньоны, яйцо, лук-порей, кукуруза, водоросли вакамэ, перец чили, кунжут, лук зеленый",
              "expanded_text": "Весь состав",
              "collapsed_text": "Свернуть",
              "collapsed_text_lines_count": 3
          }
      ],
      "available": true,
      "inStock": null,
      "price": 425,
      "decimalPrice": "425",
      "promoTypes": [],
      "optionsGroups": [],
      "picture": {
          "uri": "/images/15143849/3d5beaaf2f0c4fc7b852620e3721afbf-{w}x{h}.jpeg",
          "ratio": 1.0,
          "scale": "aspect_fill"
      },
      "weight": "400 г",
      "adult": false,
      "shippingType": "all",
      "measure": {
          "value": "400",
          "measure_unit": "g"
      },
      "nutrients_detailed": {
          "calories": {
              "name": "ккал",
              "value": "143",
              "unit": "ккал"
          },
          "proteins": {
              "name": "белки",
              "value": "9",
              "unit": "г"
          },
          "fats": {
              "name": "жиры",
              "value": "6",
              "unit": "г"
          },
          "carbohydrates": {
              "name": "углеводы",
              "value": "15",
              "unit": "г"
          },
          "description": {
              "value": "На 100 г по открытым данным для подобных блюд"
          }
      },
      "publicId": "344db031-5e7d-494b-93ec-db12b80ba2e9"
  },
  {
      "id": 606261098,
      "name": "Онтарио ролл",
      "description": "",
      "descriptions": [
          {
              "title": "Состав",
              "text": "Копчёный угорь, сливочный сыр, авокадо, огурец",
              "expanded_text": "Весь состав",
              "collapsed_text": "Свернуть",
              "collapsed_text_lines_count": 3
          }
      ],
      "available": true,
      "inStock": null,
      "price": 395,
      "decimalPrice": "395",
      "promoTypes": [],
      "optionsGroups": [],
      "picture": {
          "uri": "/images/3541746/195277832b2cd077087a8e12afd919d0-{w}x{h}.jpeg",
          "ratio": 1.0,
          "scale": "aspect_fill"
      },
      "weight": "154 г",
      "adult": false,
      "shippingType": "all",
      "measure": {
          "value": "154",
          "measure_unit": "g"
      },
      "nutrients_detailed": {
          "calories": {
              "name": "ккал",
              "value": "202",
              "unit": "ккал"
          },
          "proteins": {
              "name": "белки",
              "value": "9",
              "unit": "г"
          },
          "fats": {
              "name": "жиры",
              "value": "8",
              "unit": "г"
          },
          "carbohydrates": {
              "name": "углеводы",
              "value": "23",
              "unit": "г"
          },
          "description": {
              "value": "На 100 г по открытым данным для подобных блюд"
          }
      },
      "publicId": "3b173ce1-d0e2-4d64-b886-23d5aa3f98b9"
  },
  {
      "id": 606260983,
      "name": "Тори терияки",
      "description": "",
      "descriptions": [
          {
              "title": "Состав",
              "text": "курица, рис",
              "expanded_text": "Весь состав",
              "collapsed_text": "Свернуть",
              "collapsed_text_lines_count": 3
          }
      ],
      "available": true,
      "inStock": null,
      "price": 435,
      "decimalPrice": "435",
      "promoTypes": [],
      "optionsGroups": [],
      "picture": {
          "uri": "/images/2370127/0da487b2c8d94dc9a9caf48a3f369dac-{w}x{h}.jpeg",
          "ratio": 1.0,
          "scale": "aspect_fill"
      },
      "weight": "360 г",
      "adult": false,
      "shippingType": "all",
      "measure": {
          "value": "360",
          "measure_unit": "g"
      },
      "nutrients_detailed": {
          "calories": {
              "name": "ккал",
              "value": "237",
              "unit": "ккал"
          },
          "proteins": {
              "name": "белки",
              "value": "11",
              "unit": "г"
          },
          "fats": {
              "name": "жиры",
              "value": "9",
              "unit": "г"
          },
          "carbohydrates": {
              "name": "углеводы",
              "value": "27",
              "unit": "г"
          },
          "description": {
              "value": "На 100 г по открытым данным для подобных блюд"
          }
      },
      "publicId": "1a6b900c-00f3-48a1-a052-f9f87ff1e172"
  },
  */
