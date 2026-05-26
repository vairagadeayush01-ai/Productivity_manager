#include <iostream>
#include <string>
#include "leet.cpp"

int main() {
    Solution sol;
    std::string s1 = "aA1!";
    std::cout << "Input: \"aA1!\"\nOutput: " << sol.passwordStrength(s1) << "\nExpected: 11\n\n";

    std::string s2 = "bbB11#";
    std::cout << "Input: \"bbB11#\"\nOutput: " << sol.passwordStrength(s2) << "\nExpected: 11\n";
    return 0;
}
