import 'package:flutter_test/flutter_test.dart';
import 'package:gradeon/data/repositories/assistant_repository.dart';

void main() {
  test('mock assistant routes fee questions to the Fees screen', () async {
    final reply = await MockAssistantRepository().ask(userId: 'u1', prompt: 'How do I pay the fee?');
    expect(reply.route, '/fees');
  });

  test('mock assistant offers a way forward for anything else', () async {
    final reply = await MockAssistantRepository().ask(userId: 'u1', prompt: 'hello');
    expect(reply.suggestions, isNotEmpty);
  });

  test('replies parse from the backend contract', () {
    final reply = AssistantReply.fromJson({'text': 'Hi', 'suggestions': ['A'], 'route': '/x'});
    expect(reply.text, 'Hi');
    expect(reply.suggestions, ['A']);
    expect(reply.route, '/x');
  });
}
