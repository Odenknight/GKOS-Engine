#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstring>
#include <string>
#include <vector>
#include <stdexcept>
#define NAPI_VERSION 8
#include "node-api-v22.22.1/node_api.h"

static void need(bool value) { if (!value) throw std::runtime_error("guard unavailable"); }
template<class T> static T resolveApi(const char* name) {
  auto address = GetProcAddress(GetModuleHandleW(nullptr), name);
  need(address != nullptr);
  T result; static_assert(sizeof(result) == sizeof(address));
  memcpy(&result, &address, sizeof(result)); return result;
}
#define API(name) decltype(&::name) name = resolveApi<decltype(&::name)>(#name)
struct NodeApi {
  API(napi_get_cb_info); API(napi_is_array); API(napi_get_array_length);
  API(napi_get_element); API(napi_get_value_string_utf16); API(napi_typeof);
  API(napi_call_function); API(napi_get_undefined); API(napi_is_promise);
  API(napi_create_function); API(napi_set_named_property); API(napi_throw_error);
};
static const NodeApi& api() { static const NodeApi value; return value; }

struct Handles {
  std::vector<HANDLE> values;
  ~Handles() { for (auto handle : values) CloseHandle(handle); }
};

static std::wstring pathArgument(napi_env env, napi_value value) {
  const auto& a = api(); size_t length = 0, written = 0;
  need(a.napi_get_value_string_utf16(env, value, nullptr, 0, &length) == napi_ok);
  need(length >= 3 && length < 32760);
  std::vector<char16_t> text(length + 1);
  need(a.napi_get_value_string_utf16(env, value, text.data(), text.size(), &written) == napi_ok && written == length);
  std::wstring path(text.begin(), text.begin() + length);
  for (auto& c : path) if (c == L'/') c = L'\\';
  need(((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z')) && path[1] == L':' && path[2] == L'\\');
  need(path.find(L'\0') == std::wstring::npos && path.find(L':', 2) == std::wstring::npos);
  return path;
}

static napi_value withReadGuards(napi_env env, napi_callback_info info) {
  try {
    const auto& a = api(); size_t count = 3; napi_value args[3]; bool array = false;
    need(a.napi_get_cb_info(env, info, &count, args, nullptr, nullptr) == napi_ok && count == 2);
    need(a.napi_is_array(env, args[0], &array) == napi_ok && array);
    uint32_t length = 0; napi_valuetype callbackType;
    need(a.napi_get_array_length(env, args[0], &length) == napi_ok && length > 0 && length <= 4096);
    need(a.napi_typeof(env, args[1], &callbackType) == napi_ok && callbackType == napi_function);
    std::vector<std::wstring> paths;
    for (uint32_t i = 0; i < length; i++) {
      napi_value value; need(a.napi_get_element(env, args[0], i, &value) == napi_ok);
      paths.push_back(pathArgument(env, value));
    }
    Handles held;
    held.values.reserve(paths.size());
    for (const auto& path : paths) {
      const DWORD attributes = GetFileAttributesW(path.c_str());
      need(attributes != INVALID_FILE_ATTRIBUTES);
      const bool directory = (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
      // Files deny data writers and delete access. Directories share writes so
      // authorized child transitions work, but still deny their own deletion.
      // The opened identity must match the kind used to select sharing flags.
      HANDLE handle = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | (directory ? FILE_SHARE_WRITE : 0), nullptr,
        OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS, nullptr);
      need(handle != INVALID_HANDLE_VALUE);
      held.values.push_back(handle);
      BY_HANDLE_FILE_INFORMATION identity{};
      need(GetFileType(handle) == FILE_TYPE_DISK && GetFileInformationByHandle(handle, &identity));
      need((identity.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0);
      need(((identity.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) == directory);
      std::vector<wchar_t> finalPath(32768);
      DWORD size = GetFinalPathNameByHandleW(handle, finalPath.data(), static_cast<DWORD>(finalPath.size()), FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
      need(size > 0 && size < finalPath.size());
      const std::wstring expected = L"\\\\?\\" + path;
      need(CompareStringOrdinal(finalPath.data(), static_cast<int>(size), expected.data(), static_cast<int>(expected.size()), TRUE) == CSTR_EQUAL);
    }
    napi_value receiver, result;
    need(a.napi_get_undefined(env, &receiver) == napi_ok);
    const auto status = a.napi_call_function(env, receiver, args[1], 0, nullptr, &result);
    if (status == napi_pending_exception) return nullptr; // RAII releases every handle.
    need(status == napi_ok);
    bool promise = false; need(a.napi_is_promise(env, result, &promise) == napi_ok && !promise);
    return result;
  } catch (...) {
    try { api().napi_throw_error(env, nullptr, "GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE"); } catch (...) {}
    return nullptr;
  }
}

NAPI_MODULE_INIT() {
  try {
    const auto& a = api(); napi_value fn;
    need(a.napi_create_function(env, "withReadGuards", NAPI_AUTO_LENGTH, withReadGuards, nullptr, &fn) == napi_ok);
    need(a.napi_set_named_property(env, exports, "withReadGuards", fn) == napi_ok);
    return exports;
  } catch (...) {
    try { api().napi_throw_error(env, nullptr, "GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE"); } catch (...) {}
    return nullptr;
  }
}
