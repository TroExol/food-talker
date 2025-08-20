// const coordinates = {
//   latitude: 57.97857164606642,
//   longitude: 56.19363649099609,
// };

// fetch('https://eda.yandex.ru/eats/v1/layout-constructor/v1/layout', {
//   method: 'POST',
//   body: JSON.stringify({ location: coordinates }),
//   headers: {
//     'Content-Type': 'application/json',
//     'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
//     'x-app-version': '17.52.4',
//     'x-client-session': 'mei8lrkd-d49t83iglm-2sset7rzpp6-8qnt1cacvd',
//     'x-device-id': 'mei8lrkd-fnbl951fo7-vqvkmfvgb8f-cgrtjueuxx8',
//     'x-platform': 'desktop_web',
//     'x-retpath-y': 'https://eda.yandex.ru/perm?shippingType=delivery',
//     'x-taxi': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 platform=eats_desktop_web',
//     'x-ya-client-time': new Date().toISOString(),
//     'x-ya-coordinates': `latitude=${coordinates.latitude},longitude=${coordinates.longitude}`,
//   },
// })
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-return
//   .then(res => res.json() as any)
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
//   .then(data => console.log(data.data.places_v2_lists[0].payload.places[0]))
//   .catch(err => console.error(err));

/*
status: 200
response.data.places_v2_lists[0].payload.places[0] -
{
  "name": {
      "value": "Тсуру",
      "color": {
          "light": "#21201F",
          "dark": "#E0DEDA"
      }
  },
  "slug": "tsuru_yaponskij_restoran_lunacharskogo_69",
  "brand": {
      "slug": "tsuru_cmszp",
      "name": "Тсуру",
      "business": "restaurant"
  },
  "analytics": "CgQIBSABCgkIeBoFODk4ODAKDggVGgrQotGB0YPRgNGDCi0IFBopdHN1cnVfeWFwb25za2lqX3Jlc3RvcmFuX2x1bmFjaGFyc2tvZ29fNjkKBggSEgI8RgoECA8oAQoFCHcSAQAKMghJGhfQotC+0L8g0YDQtdGB0YLQvtGA0LDQvRoVMOKCvSDQtNC+0YHRgtCw0LLQutCwCikIJBolMTc1NTU4NzYxNTYyODMwNC0xODIzNjE3NzE0Mzk3NzYzMTQ0OQokCDkaIGQzMDVjNjcwNDY3ZTQ0N2Q3NWJjZTdhMzZmYmY4NmIwChoIJhoWcmZfcmVkZXNpZ25fZGVza3RvcF95ZQoVCCgaEXBsYWNlc19jb2xsZWN0aW9uCg8IARoLbWFpbl9zY3JlZW4KJAgjGiAzZDllMWE0NmVlMzQ0OTAyYWE0N2Q2MmNkM2FmNTY0NQo6CAIaNmQyNWYxZDBkLWZhNmItNGQwMi1hMzllLTUxNzBkZWMxZTk5ZF9wbGFjZXNfY29sbGVjdGlvbgoaCAMaFlBMQUNFU19DT0xMRUNUSU9OX09QRU4KBggKEgIANw==",
  "picture": {
      "image": "/images/3538649/bd3b8a0bec0bd4b2d0a4ff01f447ca46-{w}x{h}.jpg"
  },
  "left_meta": [
      {
          "id": "acec14c67bae4a439b03c0b7ff121078",
          "type": "info",
          "payload": {
              "icon": {
                  "type": "colored_icon",
                  "icon": {
                      "color": {
                          "light": "#21201F",
                          "dark": "#E0DEDA"
                      },
                      "url": "https://avatars.mds.yandex.net/get-bunker/118781/dbcc07432e7d1a3adebf5a1d50c34de821adbe54/orig"
                  }
              },
              "text": {
                  "value": "60 – 70 мин",
                  "color": {
                      "light": "#21201F",
                      "dark": "#E0DEDA"
                  }
              },
              "type": "info"
          }
      }
  ],
  "features": {
      "rating": {
          "text": {
              "value": "4.7",
              "color": {
                  "light": "#21201F",
                  "dark": "#E0DEDA"
              }
          },
          "icon": {
              "color": {
                  "light": "#21201F",
                  "dark": "#E0DEDA"
              },
              "url": "https://avatars.mds.yandex.net/get-bunker/118781/c1a3944a61af9f56842969233852ba172d8b91bf/orig"
          }
      },
      "user_collections": {
          "in_collections": false
      }
  },
  "chips": [
      {
          "type": "base",
          "payload": {
              "background": {
                  "light": "#0596FA1A",
                  "dark": "#0596FA1A"
              },
              "text": {
                  "value": "Топ ресторан",
                  "color": {
                      "light": "#0596FA",
                      "dark": "#0596FA"
                  }
              }
          }
      },
      {
          "type": "base",
          "payload": {
              "background": {
                  "light": "#2398081A",
                  "dark": "#48C6001A"
              },
              "text": {
                  "value": "0₽ доставка",
                  "color": {
                      "light": "#239808",
                      "dark": "#48C600"
                  }
              }
          }
      }
  ]
}
*/
