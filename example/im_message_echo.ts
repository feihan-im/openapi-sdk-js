// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { FeihanClient, MessageType_CARD } from '@feihan-im/sdk';

async function main() {
  const client = await FeihanClient.create(
    'http://localhost:11000',
    'c-TestAppId2',
    'TestAppSecret2',
  );

  client.Im.v1.Message.Event.onMessageReceive(async (event) => {
    console.log('Message received:', JSON.stringify(event, null, 2));

    client.Im.v1.Chat.createTyping({
      chat_id: event.body.message?.chat_id,
    });

    await client.Im.v1.Message.readMessage({
      message_id: event.body.message?.message_id,
    });

    try {
      await client.Im.v1.Message.sendMessage({
        message_type: MessageType_CARD,
        message_content: {
          card: {
            schema: '1.0',
            v1: {
              header: {
                title: 'Feihan new version released!',
                title_i18n: { en: 'Feihan new version released!' },
                template: 'green',
              },
              body: {
                message_text: {
                  content: 'New version features:\n- Added a Night Mode theme\n- Added multilingual support\n- Fixed the iOS video playback crash issue',
                },
                message_text_i18n: {
                  en: {
                    content: 'New version features:\n- Added a Night Mode theme\n- Added multilingual support\n- Fixed the iOS video playback crash issue',
                  },
                },
              },
              footer: {
                button_list: [
                  { button_text: 'Open website', button_text_i18n: { en: 'Jump to official website' }, link: { url: 'https://feihanim.cn/' }, template: 'default' },
                  { button_text: 'Open website', button_text_i18n: { en: 'Jump to official website' }, link: { url: 'https://feihanim.cn/' }, template: 'primary_filled' },
                  { button_text: 'Open website', button_text_i18n: { en: 'Jump to official website' }, link: { url: 'https://feihanim.cn/' }, template: 'primary' },
                  { button_text: 'Open website', button_text_i18n: { en: 'Jump to official website' }, link: { url: 'https://feihanim.cn/' }, template: 'danger' },
                  { button_text: 'Open website', button_text_i18n: { en: 'Jump to official website' }, link: { url: 'https://feihanim.cn/' }, template: 'danger_filled' },
                  { button_text: 'Open website', button_text_i18n: { en: 'Jump to official website' }, link: { url: 'https://feihanim.cn/' }, template: 'danger_text' },
                  { button_text: 'Open website', button_text_i18n: { en: 'Jump to official website' }, link: { url: 'https://feihanim.cn/' }, template: 'primary_text' },
                ],
                button_align: 'start',
              },
            },
          },
        },
        chat_id: event.body.message?.chat_id,
      });
    } catch (err) {
      console.error('Send message failed:', err);
    }

    client.Im.v1.Chat.deleteTyping({
      chat_id: event.body.message?.chat_id,
    });
  });

  // Keep alive for 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  await client.close();
}

main().catch(console.error);
