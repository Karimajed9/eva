package dev.karimajed.eva.speech.whisper;

import dev.karimajed.eva.conversation.CancelToken;
import java.nio.file.Path;
import java.util.List;

public interface CommandRunner {

    String run(List<String> command, Path directory, CancelToken cancel);
}
